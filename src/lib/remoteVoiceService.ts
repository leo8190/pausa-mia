// Cliente opcional para síntesis de voz argentina en un servidor propio.
// Sólo envía el texto del guion tras acción y consentimiento explícitos en la UI.
// Sin VITE_ARGENTINE_TTS_ENDPOINT no se realiza ninguna petición.

/** Límite del texto completo enviado en una sesión de síntesis remota. */
export const MAX_REMOTE_TTS_TOTAL_CHARS = 12_000;

/** Límite por segmento individual (POST /v1/tts). */
export const MAX_REMOTE_TTS_SEGMENT_CHARS = 800;

/**
 * Timeout del POST /v1/tts. Cubre cold start típico del servicio remoto sin
 * dejar la petición colgada indefinidamente en móviles.
 */
export const REMOTE_TTS_TIMEOUT_MS = 45_000;

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
 * Combina un AbortSignal externo con un timeout propio.
 * Al dispararse el timeout o el abort externo, cancela el fetch (sin dejar
 * requests colgadas). `cleanup` debe llamarse siempre al terminar.
 */
export function createRemoteTtsAbortSignal(
  external?: AbortSignal,
  timeoutMs: number = REMOTE_TTS_TIMEOUT_MS,
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', onExternalAbort);
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (external) {
        external.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

function classifyFetchFailure(err: unknown): RemoteVoiceError {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new RemoteVoiceError(
      'Sin conexión a internet. No se pudo contactar el servicio de voz remota.',
      'offline',
    );
  }

  const message = err instanceof Error ? err.message : '';
  if (/failed to fetch|networkerror|load failed|cors|access-control/i.test(message)) {
    return new RemoteVoiceError(
      'No se pudo contactar el servicio de voz remota. Revisá la conexión o que el origen esté permitido (CORS).',
      'cors',
    );
  }

  return new RemoteVoiceError(
    err instanceof Error
      ? `No se pudo contactar el servicio de voz remota: ${err.message}`
      : 'No se pudo contactar el servicio de voz remota.',
    'network_error',
  );
}

/**
 * POST JSON `{ text }` al endpoint configurado. Devuelve un `Blob` `audio/wav`.
 * No envía nada si el endpoint está vacío.
 * Aplica timeout explícito y abort limpio; respeta `options.signal` externo.
 */
export async function synthesizeRemoteArgentineVoice(
  text: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
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
  const { signal, didTimeout, cleanup } = createRemoteTtsAbortSignal(
    options?.signal,
    options?.timeoutMs ?? REMOTE_TTS_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'audio/wav, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      if (didTimeout()) {
        throw new RemoteVoiceError(
          'La solicitud de voz remota agotó el tiempo de espera. Probá de nuevo en unos segundos.',
          'timeout',
        );
      }
      throw new RemoteVoiceError('La solicitud de voz remota se canceló.', 'aborted');
    }
    throw classifyFetchFailure(err);
  } finally {
    cleanup();
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
