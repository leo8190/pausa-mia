import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VoiceServiceConfig } from './config.js';

export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  config: VoiceServiceConfig,
): boolean {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  if (config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  }
  return false;
}
