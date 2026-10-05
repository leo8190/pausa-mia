import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VoiceServiceConfig } from './config.js';

export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  config: VoiceServiceConfig,
): boolean {
  const origin = req.headers.origin;
  if (!origin) {
    // La protección estricta aplica al endpoint que procesa texto. Health y
    // preflight deben seguir funcionando sin Origin para los health checks y
    // herramientas de infraestructura.
    const isTtsRequest =
      req.method === 'POST' &&
      ['/v1/tts', '/v1/leonardo/tts'].includes((req.url ?? '').split('?', 1)[0]);
    return !config.requireOrigin || !isTtsRequest;
  }
  if (config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, X-Pausa-Voice-Consent',
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Pausa-Voice-Provider, X-Pausa-Voice-Id, X-Pausa-Voice-Speed, Retry-After',
    );
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  }
  return false;
}
