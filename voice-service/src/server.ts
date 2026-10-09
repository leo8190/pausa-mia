import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { VoiceServiceConfig } from './config.js';
import { bearerToken, verifyAccessToken } from './access.js';
import { DailyCharBudget } from './budget.js';
import { applyCors } from './cors.js';
import { jsonError, validateText } from './limits.js';
import { synthesizeWav, TtsError } from './piper.js';
import { InMemoryTtsRateLimiter, resolveClientId } from './rate-limit.js';
import {
  HeygenError,
  LEONARDO_DELIVERY_SPEED,
  LEONARDO_VOICE_ID,
  leonardoGenerationVerified,
  synthesizeLeonardoAudio,
  type HeygenFetch,
} from './heygen.js';

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
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

export function createVoiceServer(
  config: VoiceServiceConfig,
  dependencies: { heygenFetch?: HeygenFetch } = {},
): Server {
  const ttsRateLimiter = new InMemoryTtsRateLimiter(config.ttsRateLimitPerMinute);
  // A global ceiling also bounds paid requests when a proxy address is shared.
  // Do not trust arbitrary forwarded headers for the paid integration.
  const leonardoRateLimiter = new InMemoryTtsRateLimiter(
    Math.min(config.ttsRateLimitPerMinute, 30),
  );
  const leonardoBudget = new DailyCharBudget(
    config.leonardoDailyCharBudget,
    config.leonardoBudgetFile,
  );
  return createServer((req, res) => {
    void handleRequest(
      req,
      res,
      config,
      ttsRateLimiter,
      leonardoRateLimiter,
      leonardoBudget,
      dependencies,
    );
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: VoiceServiceConfig,
  ttsRateLimiter: InMemoryTtsRateLimiter,
  leonardoRateLimiter: InMemoryTtsRateLimiter,
  leonardoBudget: DailyCharBudget,
  dependencies: { heygenFetch?: HeygenFetch },
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

    if (req.method === 'GET' && url.pathname === '/v1/leonardo/capabilities') {
      res.setHeader('Cache-Control', 'no-store');
      sendJson(res, 200, {
        provider: 'heygen',
        voiceId: LEONARDO_VOICE_ID,
        deliverySpeed: LEONARDO_DELIVERY_SPEED,
        generationVerified: leonardoGenerationVerified(config),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/leonardo/tts') {
      if (!leonardoGenerationVerified(config)) {
        throw new HeygenError('leonardo_disabled', 503);
      }
      if (req.headers['x-pausa-voice-consent'] !== 'session') {
        sendJson(
          res,
          403,
          jsonError('consent_required', 'Necesitamos permiso para preparar esta voz.'),
        );
        return;
      }
      const subject = verifyAccessToken(
        bearerToken(req.headers.authorization),
        config.leonardoAccessSecret,
      );
      if (!subject) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        sendJson(
          res,
          401,
          jsonError('auth_required', 'Ingresá a tu cuenta para usar esta voz.'),
        );
        return;
      }
      const subjectLimit = leonardoRateLimiter.check(`subject:${subject}`);
      const clientLimit = subjectLimit.ok
        ? leonardoRateLimiter.check(`client:${req.socket.remoteAddress ?? 'unknown'}`)
        : subjectLimit;
      const globalLimit = clientLimit.ok
        ? leonardoRateLimiter.check('global')
        : clientLimit;
      if (!globalLimit.ok) {
        res.setHeader('Retry-After', String(globalLimit.retryAfterSeconds));
        sendJson(
          res,
          429,
          jsonError(
            'rate_limited',
            'Demasiadas solicitudes. Intentá nuevamente en breve.',
          ),
        );
        return;
      }
      if (
        req.headers['content-type']?.split(';')[0].trim().toLowerCase() !==
        'application/json'
      ) {
        sendJson(
          res,
          415,
          jsonError('invalid_content_type', 'Se espera un guion en formato JSON.'),
        );
        return;
      }
      const body = await readJsonBody(req);
      const fields =
        body && typeof body === 'object' && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : null;
      if (
        !fields ||
        fields.voiceId !== LEONARDO_VOICE_ID ||
        fields.deliverySpeed !== LEONARDO_DELIVERY_SPEED ||
        Object.keys(fields).some(
          (key) => !['text', 'voiceId', 'deliverySpeed'].includes(key),
        )
      ) {
        sendJson(
          res,
          400,
          jsonError(
            'voice_identity_mismatch',
            'La solicitud no corresponde a la voz elegida.',
          ),
        );
        return;
      }
      const validated = validateText(fields.text, Math.min(config.maxTextChars, 800));
      if (!validated.ok) {
        sendJson(res, 400, validated.body);
        return;
      }
      const budget = leonardoBudget.reserve(validated.text.length);
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.retryAfterSeconds));
        sendJson(
          res,
          429,
          jsonError(
            'budget_exhausted',
            'La voz de Leonardo alcanzó su límite de hoy. Probá con otra voz o volvé mañana.',
          ),
        );
        return;
      }
      const controller = new AbortController();
      const cancel = () => controller.abort();
      const cancelOnClose = () => {
        if (!res.writableEnded) cancel();
      };
      req.once('aborted', cancel);
      res.once('close', cancelOnClose);
      try {
        const audio = await synthesizeLeonardoAudio(validated.text, config, {
          signal: controller.signal,
          fetch: dependencies.heygenFetch,
        });
        if (res.destroyed) return;
        res.writeHead(200, {
          'Content-Type': audio.contentType,
          'Content-Length': audio.bytes.length,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Pausa-Voice-Provider': 'heygen',
          'X-Pausa-Voice-Id': LEONARDO_VOICE_ID,
          'X-Pausa-Voice-Speed': String(LEONARDO_DELIVERY_SPEED),
        });
        res.end(audio.bytes);
      } finally {
        req.off('aborted', cancel);
        res.off('close', cancelOnClose);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/tts') {
      const clientId = resolveClientId(req);
      const rateLimit = ttsRateLimiter.check(clientId);
      if (!rateLimit.ok) {
        res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
        sendJson(
          res,
          429,
          jsonError(
            'rate_limited',
            'Demasiadas solicitudes. Intentá nuevamente en breve.',
          ),
        );
        return;
      }

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
    if (res.destroyed) return;
    if (err instanceof HeygenError) {
      sendJson(res, err.httpStatus, jsonError(err.code, err.message));
      return;
    }
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
    sendJson(res, 500, jsonError('internal_error', 'Error interno'));
  }
}
