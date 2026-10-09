import { MIN_ACCESS_SECRET_LENGTH } from './access.js';
import type { VoiceServiceConfig } from './config.js';
import { TtsError } from './piper.js';

export const LEONARDO_VOICE_ID = 'db2a543de8bd431899957059671861b4';
export const LEONARDO_DELIVERY_SPEED = 0.85;
export const LEONARDO_SPEECH_ENGINE = 'orca';
export const HEYGEN_SPEECH_URL = 'https://api.heygen.com/v3/voices/speech';
export const MAX_LEONARDO_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_PROVIDER_JSON_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 45_000;
const AUDIO_HOSTS = new Set(['resource2.heygen.ai']);

export type HeygenFetch = typeof fetch;
export type LeonardoAudio = { bytes: Buffer; contentType: 'audio/wav' | 'audio/mpeg' };

/** This flag records a deliberate verification using the deployment's own key.
 * A successful MCP call or merely configuring a key must not enable it.
 */
export function leonardoGenerationVerified(config: VoiceServiceConfig): boolean {
  return (
    config.leonardoEnabled &&
    config.leonardoGenerationVerified &&
    Boolean(config.heygenApiKey?.trim()) &&
    (config.leonardoAccessSecret?.length ?? 0) >= MIN_ACCESS_SECRET_LENGTH &&
    config.leonardoDailyCharBudget > 0
  );
}

export class HeygenError extends TtsError {
  constructor(
    code: string,
    readonly httpStatus = 502,
  ) {
    super(
      code === 'leonardo_disabled'
        ? 'La voz de Leonardo todavía no está habilitada.'
        : code === 'generation_cancelled'
          ? 'Preparación de voz cancelada.'
          : 'No pudimos preparar la voz de Leonardo.',
      code,
    );
  }
}

async function limitedBytes(response: Response, limit: number): Promise<Buffer> {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > limit) {
    await response.body?.cancel();
    throw new HeygenError('provider_response_too_large');
  }
  if (!response.body) throw new HeygenError('provider_empty_response');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new HeygenError('provider_response_too_large');
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function audioUrl(value: unknown, responseVoiceId: unknown): URL {
  if (typeof value !== 'string') throw new HeygenError('provider_invalid_response');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HeygenError('provider_invalid_audio_url');
  }
  if (
    url.protocol !== 'https:' ||
    !AUDIO_HOSTS.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new HeygenError('provider_invalid_audio_url');
  }
  // HeyGen's documented response has no voice ID. Its own audio path is the
  // available identity evidence, e.g. /text_to_speech/<job>/<voice-id>/<file>.
  let path: string[];
  try {
    path = url.pathname.split('/').map(decodeURIComponent);
  } catch {
    throw new HeygenError('provider_invalid_audio_url');
  }
  if (responseVoiceId !== undefined && responseVoiceId !== LEONARDO_VOICE_ID)
    throw new HeygenError('provider_identity_mismatch');
  if (responseVoiceId !== LEONARDO_VOICE_ID && !path.includes(LEONARDO_VOICE_ID))
    throw new HeygenError('provider_identity_unverified');
  return url;
}

function validateAudio(bytes: Buffer): LeonardoAudio['contentType'] {
  // HeyGen can name an MP3 file .wav and label it audio/wav. Sniff the bytes
  // and expose their actual encoding, without altering voice speed or pitch.
  const wav =
    bytes.length > 44 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WAVE';
  if (wav) return 'audio/wav';
  const mp3 =
    bytes.length > 10 &&
    (bytes.subarray(0, 3).toString('ascii') === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (mp3) return 'audio/mpeg';
  throw new HeygenError('provider_invalid_audio');
}

/** One billed request, never a retry. Only the fixed approved clone is sent.
 * Text and provider errors are not logged or returned to clients. API secrets
 * remain in this server process; the subsequent CDN download has no API key.
 */
export async function synthesizeLeonardoAudio(
  text: string,
  config: VoiceServiceConfig,
  options: { signal?: AbortSignal; fetch?: HeygenFetch } = {},
): Promise<LeonardoAudio> {
  if (!leonardoGenerationVerified(config))
    throw new HeygenError('leonardo_disabled', 503);
  if (!text.trim() || text.length > 800) throw new HeygenError('invalid_text', 400);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
  const request = options.fetch ?? fetch;
  try {
    if (controller.signal.aborted) throw new HeygenError('generation_cancelled', 408);
    const response = await request(HEYGEN_SPEECH_URL, {
      method: 'POST',
      redirect: 'error',
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.heygenApiKey!,
      },
      body: JSON.stringify({
        text: text.trim(),
        voice_id: LEONARDO_VOICE_ID,
        engine: LEONARDO_SPEECH_ENGINE,
        speed: LEONARDO_DELIVERY_SPEED,
        language: 'es',
        locale: 'es-AR',
        input_type: 'text',
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new HeygenError('provider_generation_failed');
    }
    let result: unknown;
    try {
      result = JSON.parse(
        (await limitedBytes(response, MAX_PROVIDER_JSON_BYTES)).toString('utf8'),
      );
    } catch (error) {
      if (error instanceof HeygenError) throw error;
      throw new HeygenError('provider_invalid_response');
    }
    const body =
      result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
    const data =
      body?.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : body;
    if (data?.engine !== undefined && data.engine !== LEONARDO_SPEECH_ENGINE)
      throw new HeygenError('provider_engine_mismatch');
    const url = audioUrl(data?.audio_url, data?.voice_id);
    const audio = await request(url, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!audio.ok) {
      await audio.body?.cancel();
      throw new HeygenError('provider_audio_download_failed');
    }
    const bytes = await limitedBytes(audio, MAX_LEONARDO_AUDIO_BYTES);
    const contentType = validateAudio(bytes);
    if (controller.signal.aborted) throw new HeygenError('generation_cancelled', 408);
    return { bytes, contentType };
  } catch (error) {
    if (controller.signal.aborted) throw new HeygenError('generation_cancelled', 408);
    if (error instanceof HeygenError) throw error;
    throw new HeygenError('provider_connection_failed');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
