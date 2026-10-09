import { buildAccountApiUrl } from './accountApiUrl';

/** The approved clone is fixed; caller text cannot select another speaker. */
export const LEONARDO_VOICE_ID = 'db2a543de8bd431899957059671861b4';
export const LEONARDO_DELIVERY_SPEED = 0.85 as const;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 45_000;

export class LeonardoVoiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LeonardoVoiceError';
  }
}
export function getLeonardoTtsEndpoint(): string {
  const raw = import.meta.env.VITE_LEONARDO_TTS_ENDPOINT;
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
}
function checkedEndpoint(): string {
  const raw = getLeonardoTtsEndpoint();
  if (!raw)
    throw new LeonardoVoiceError(
      'not_configured',
      'La voz de Leonardo todavía no está conectada.',
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LeonardoVoiceError(
      'invalid_endpoint',
      'La conexión de voz no es válida.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new LeonardoVoiceError(
      'invalid_endpoint',
      'La conexión de voz no es válida.',
    );
  }
  return raw;
}
function checkAbort(signal: AbortSignal) {
  if (signal.aborted)
    throw new LeonardoVoiceError('aborted', 'Preparación de voz cancelada.');
}
function validateAudio(bytes: Uint8Array, type: string) {
  const wav =
    type === 'audio/wav' &&
    bytes.length > 44 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE';
  const mp3 =
    type === 'audio/mpeg' &&
    bytes.length > 10 &&
    (String.fromCharCode(...bytes.slice(0, 3)) === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (!wav && !mp3)
    throw new LeonardoVoiceError(
      'invalid_audio',
      'El servicio no devolvió un audio válido.',
    );
}
export type LeonardoAudio = {
  audio: Blob;
  provider: 'heygen';
  voiceId: typeof LEONARDO_VOICE_ID;
  deliverySpeed: typeof LEONARDO_DELIVERY_SPEED;
};

/** Prepared integration: nothing calls this until a real service is enabled.
 * Consent is per session. A capability check precedes any personal script.
 * Never retry billed synthesis or substitute a generic voice on failure.
 */
export async function synthesizeLeonardoVoice(
  text: string,
  options: { consent: boolean; signal?: AbortSignal },
): Promise<LeonardoAudio> {
  if (!options.consent)
    throw new LeonardoVoiceError(
      'consent_required',
      'Necesitamos tu permiso para enviar el guion a HeyGen.',
    );
  const normalized = text.trim();
  if (!normalized || normalized.length > 800)
    throw new LeonardoVoiceError(
      'invalid_text',
      'El texto no se puede preparar para esta voz.',
    );
  const endpoint = checkedEndpoint();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, TIMEOUT_MS);
  const init = {
    signal: controller.signal,
    credentials: 'omit' as const,
    redirect: 'error' as const,
  };
  try {
    checkAbort(controller.signal);
    const ready = await fetch(`${endpoint}/v1/leonardo/capabilities`, init);
    if (!ready.ok)
      throw new LeonardoVoiceError(
        'provider_unverified',
        'La voz de Leonardo todavía no está habilitada.',
      );
    const capability = await ready.json();
    checkAbort(controller.signal);
    if (
      capability?.provider !== 'heygen' ||
      capability?.voiceId !== LEONARDO_VOICE_ID ||
      capability?.deliverySpeed !== LEONARDO_DELIVERY_SPEED ||
      capability?.generationVerified !== true
    ) {
      throw new LeonardoVoiceError(
        'provider_unverified',
        'No pudimos confirmar la voz de Leonardo.',
      );
    }
    // Paid synthesis needs a short-lived token tied to a signed-in account.
    // Only the account API receives the session cookie; the voice service never does.
    const access = await fetch(buildAccountApiUrl('/api/account/voice-token'), {
      signal: controller.signal,
      method: 'POST',
      credentials: 'include',
      redirect: 'error',
    });
    checkAbort(controller.signal);
    if (access.status === 401)
      throw new LeonardoVoiceError(
        'auth_required',
        'Para escuchar la voz de Leonardo, ingresá a tu cuenta. También podés elegir otra voz en «Editar mi pausa».',
      );
    const accessBody = access.ok ? await access.json().catch(() => null) : null;
    const token = typeof accessBody?.token === 'string' ? accessBody.token : '';
    if (!/^v1\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
      throw new LeonardoVoiceError(
        'provider_unverified',
        'La voz de Leonardo todavía no está habilitada.',
      );
    checkAbort(controller.signal);
    const response = await fetch(`${endpoint}/v1/leonardo/tts`, {
      ...init,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Pausa-Voice-Consent': 'session',
      },
      body: JSON.stringify({
        text: normalized,
        voiceId: LEONARDO_VOICE_ID,
        deliverySpeed: LEONARDO_DELIVERY_SPEED,
      }),
    });
    checkAbort(controller.signal);
    if (response.status === 429)
      throw new LeonardoVoiceError(
        'limit_reached',
        'La voz de Leonardo llegó a su límite por ahora. Probá más tarde o elegí otra voz.',
      );
    if (!response.ok)
      throw new LeonardoVoiceError(
        'provider_error',
        'No pudimos preparar la voz. Podés volver a intentar.',
      );
    if (
      response.headers.get('X-Pausa-Voice-Provider') !== 'heygen' ||
      response.headers.get('X-Pausa-Voice-Id') !== LEONARDO_VOICE_ID ||
      response.headers.get('X-Pausa-Voice-Speed') !== String(LEONARDO_DELIVERY_SPEED)
    ) {
      await response.body?.cancel();
      throw new LeonardoVoiceError(
        'identity_mismatch',
        'El audio no acredita la voz elegida.',
      );
    }
    const type =
      response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '';
    const declaredSize = Number(response.headers.get('Content-Length'));
    if (!['audio/wav', 'audio/mpeg'].includes(type) || declaredSize > MAX_AUDIO_BYTES) {
      await response.body?.cancel();
      throw new LeonardoVoiceError(
        'invalid_audio',
        'El servicio no devolvió un audio válido.',
      );
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (!response.body)
      throw new LeonardoVoiceError('invalid_audio', 'El audio está vacío.');
    const reader = response.body.getReader();
    try {
      while (true) {
        checkAbort(controller.signal);
        const part = await reader.read();
        checkAbort(controller.signal);
        if (part.done) break;
        total += part.value.byteLength;
        if (total > MAX_AUDIO_BYTES) {
          await reader.cancel();
          throw new LeonardoVoiceError(
            'invalid_audio',
            'El audio excede el tamaño permitido.',
          );
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    validateAudio(bytes, type);
    checkAbort(controller.signal);
    return {
      audio: new Blob([bytes], { type }),
      provider: 'heygen',
      voiceId: LEONARDO_VOICE_ID,
      deliverySpeed: LEONARDO_DELIVERY_SPEED,
    };
  } catch (error) {
    if (controller.signal.aborted)
      throw new LeonardoVoiceError('aborted', 'Preparación de voz cancelada.');
    if (error instanceof LeonardoVoiceError) throw error;
    throw new LeonardoVoiceError(
      'provider_error',
      'No pudimos conectar con el servicio de voz.',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
