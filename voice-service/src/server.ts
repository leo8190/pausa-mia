import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { VoiceServiceConfig } from './config.js';
import { applyCors } from './cors.js';
import { jsonError, validateText } from './limits.js';
import { synthesizeWav, TtsError } from './piper.js';

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new TtsError('Cuerpo demasiado grande.', 'body_too_large');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    throw new TtsError('Cuerpo vacío.', 'empty_body');
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new TtsError('JSON inválido.', 'invalid_json');
  }
}

export function createVoiceServer(config: VoiceServiceConfig): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, config);
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: VoiceServiceConfig,
): Promise<void> {
  try {
    const corsOk = applyCors(req, res, config);
    if (!corsOk) {
      sendJson(res, 403, jsonError('cors_denied', 'Origen no permitido.'));
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        backend: config.backend,
        maxTextChars: config.maxTextChars,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/tts') {
      const body = await readJsonBody(req);
      const textField =
        body && typeof body === 'object' && 'text' in body
          ? (body as { text: unknown }).text
          : undefined;
      const validated = validateText(textField, config.maxTextChars);
      if (!validated.ok) {
        sendJson(res, 400, validated.body);
        return;
      }

      const wav = await synthesizeWav(validated.text, config);
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': wav.length,
        'Cache-Control': 'no-store',
      });
      res.end(wav);
      return;
    }

    sendJson(res, 404, jsonError('not_found', 'Ruta no encontrada.'));
  } catch (err) {
    if (err instanceof TtsError) {
      const status =
        err.code === 'body_too_large'
          ? 413
          : err.code === 'model_missing' || err.code === 'piper_spawn_failed'
            ? 503
            : 400;
      sendJson(res, status, jsonError(err.code, err.message));
      return;
    }
    sendJson(
      res,
      500,
      jsonError(
        'internal_error',
        err instanceof Error ? err.message : 'Error interno',
      ),
    );
  }
}
