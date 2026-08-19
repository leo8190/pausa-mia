// Cliente opcional para síntesis de voz argentina en un servidor propio.
// Sólo envía el texto del guion tras acción y consentimiento explícitos en la UI.
// Sin VITE_ARGENTINE_TTS_ENDPOINT no se realiza ninguna petición.

/** Límite del texto completo enviado en una sesión de síntesis remota. */
export const MAX_REMOTE_TTS_TOTAL_CHARS = 12_000;

/** Límite por segmento individual (POST /v1/tts). */
export const MAX_REMOTE_TTS_SEGMENT_CHARS = 800;

export type RemoteTtsRequestBody = {
  text: string;
};

export type RemoteTtsJsonError = {
  error: string;
  code?: string;
};

export class RemoteVoiceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'RemoteVoiceError';
    this.code = code;
  }
}

/**
 * Endpoint base sin barra final. Vacío por defecto (sin red).
 */
export function getArgentineTtsEndpoint(): string {
  const raw = import.meta.env.VITE_ARGENTINE_TTS_ENDPOINT;
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
}

export function isRemoteArgentineTtsConfigured(): boolean {
  return getArgentineTtsEndpoint().length > 0;
}

export function assertRemoteTextLimits(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new RemoteVoiceError('El texto a sintetizar está vacío.', 'empty_text');
  }
  if (trimmed.length > MAX_REMOTE_TTS_SEGMENT_CHARS) {
    throw new RemoteVoiceError(
      `El segmento supera el límite de ${MAX_REMOTE_TTS_SEGMENT_CHARS} caracteres.`,
      'segment_too_long',
    );
  }
}

export function assertRemoteSessionTextLimits(fullText: string): void {
  if (fullText.length > MAX_REMOTE_TTS_TOTAL_CHARS) {
    throw new RemoteVoiceError(
      `El guion supera el límite remoto de ${MAX_REMOTE_TTS_TOTAL_CHARS} caracteres.`,
      'session_too_long',
    );
  }
}

/**
 * POST JSON `{ text }` al endpoint configurado. Devuelve un `Blob` `audio/wav`.
 * No envía nada si el endpoint está vacío.
 */
export async function synthesizeRemoteArgentineVoice(
  text: string,
  options?: { signal?: AbortSignal },
): Promise<Blob> {
  const endpoint = getArgentineTtsEndpoint();
  if (!endpoint) {
    throw new RemoteVoiceError(
      'No hay un endpoint remoto configurado (VITE_ARGENTINE_TTS_ENDPOINT).',
      'endpoint_missing',
    );
  }

  assertRemoteTextLimits(text);

  const url = `${endpoint}/v1/tts`;
  const body: RemoteTtsRequestBody = { text: text.trim() };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'audio/wav, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new RemoteVoiceError('La solicitud de voz remota se canceló.', 'aborted');
    }
    throw new RemoteVoiceError(
      err instanceof Error
        ? `No se pudo contactar el servicio de voz remota: ${err.message}`
        : 'No se pudo contactar el servicio de voz remota.',
      'network_error',
    );
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    let message = `El servicio de voz remota respondió ${response.status}.`;
    let code = 'http_error';
    if (contentType.includes('application/json')) {
      try {
        const payload = (await response.json()) as RemoteTtsJsonError;
        if (payload.error) message = payload.error;
        if (payload.code) code = payload.code;
      } catch {
        // conservar mensaje genérico
      }
    }
    throw new RemoteVoiceError(message, code);
  }

  if (!contentType.includes('audio/wav') && !contentType.includes('audio/x-wav')) {
    throw new RemoteVoiceError(
      `Respuesta inesperada del servicio remoto (Content-Type: ${contentType || 'ausente'}).`,
      'invalid_content_type',
    );
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new RemoteVoiceError(
      'El servicio remoto devolvió audio vacío.',
      'empty_audio',
    );
  }

  return new Blob([blob], { type: 'audio/wav' });
}
