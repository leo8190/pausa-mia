import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import {
  ALLOWED_ORIGINS,
  createAiServerHandler,
  getCorsAllowOrigin,
  readBodyLimited,
} from './core.mjs';
import {
  buildSessionCookie,
  buildSessionCookieClear,
  createLoginSecretHash,
  createSessionToken,
  getSessionCookieName,
  getSessionExpirationDate,
  hashSessionToken,
  parseCookieHeader,
  verifyLoginSecret,
} from './accountAuth.mjs';
import {
  ConnectorNotConfiguredError,
  getConnector,
  SUPPORTED_CONNECTOR_PROVIDERS,
} from './connectors.mjs';

const VALID_LOCALES = new Set(['es-AR', 'es-neutro']);

function nowIso() {
  return new Date().toISOString();
}

function isSessionActive(session) {
  if (!session || session.revokedAt) return false;
  return session.expiresAt > nowIso();
}

function setCorsHeaders(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  const allowedOrigin = getCorsAllowOrigin(origin, allowedOrigins, true);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body, cookie = null) {
  if (cookie) {
    res.setHeader('Set-Cookie', cookie);
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, code, cookie = null, details = undefined) {
  const payload = details ? { error: code, details } : { error: code };
  sendJson(res, status, payload, cookie);
}

function toPublicUser(user) {
  return {
    id: user.id,
    createdAt: user.createdAt,
    displayName: user.displayName,
    locale: user.locale,
    status: user.status,
  };
}

async function readJsonBody(req) {
  const raw = await readBodyLimited(req);
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new Error('BODY_INVALID');
  }
}

async function requireAuthContext(req, store, sessionPepper) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sessionToken = cookies[getSessionCookieName()];
  if (!sessionToken) return { ok: false, reason: 'missing' };

  const tokenHash = hashSessionToken(sessionToken, sessionPepper);
  const session = store.getSessionByTokenHash(tokenHash);
  if (!isSessionActive(session)) return { ok: false, reason: 'invalid', tokenHash };

  const user = store.findActiveUserById(session.userId);
  if (!user) return { ok: false, reason: 'missing-user', tokenHash };

  return { ok: true, tokenHash, session, user };
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return scopes
    .filter((scope) => typeof scope === 'string')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
    .slice(0, 20);
}

export function createAppHandler(options = {}) {
  const allowedOrigins = options.allowedOrigins ?? ALLOWED_ORIGINS;
  const aiHandler = createAiServerHandler({
    ...(options.ai ?? {}),
    allowedOrigins,
  });
  const store = options.store;
  const sessionPepper =
    options.sessionPepper ??
    process.env.SESSION_PEPPER ??
    randomBytes(16).toString('hex');

  if (!store) {
    throw new Error('STORE_REQUIRED');
  }

  return async function appHandler(req, res) {
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const pathname = requestUrl.pathname;

    if (pathname.startsWith('/api/account') || pathname.startsWith('/api/connectors')) {
      setCorsHeaders(req, res, allowedOrigins);

      if (req.method === 'OPTIONS') {
        if (!getCorsAllowOrigin(req.headers.origin, allowedOrigins, true)) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      if (!getCorsAllowOrigin(req.headers.origin, allowedOrigins, true)) {
        sendError(res, 403, 'ORIGIN_NOT_ALLOWED');
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/api/account/status') {
      const auth = await requireAuthContext(req, store, sessionPepper);
      if (!auth.ok) {
        sendJson(res, 200, { authenticated: false, mode: 'guest' });
        return;
      }
      sendJson(res, 200, {
        authenticated: true,
        mode: 'account',
        user: toPublicUser(auth.user),
        session: { id: auth.session.id, expiresAt: auth.session.expiresAt },
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/account/register') {
      try {
        const body = await readJsonBody(req);
        const displayName =
          typeof body.displayName === 'string' ? body.displayName.trim() : '';
        const locale = typeof body.locale === 'string' ? body.locale : 'es-AR';
        const loginSecret =
          typeof body.loginSecret === 'string' ? body.loginSecret : '';

        if (displayName.length > 80) {
          sendError(res, 400, 'DISPLAY_NAME_INVALID');
          return;
        }
        if (!VALID_LOCALES.has(locale)) {
          sendError(res, 400, 'LOCALE_INVALID');
          return;
        }
        if (loginSecret.length < 8 || loginSecret.length > 256) {
          sendError(res, 400, 'LOGIN_SECRET_INVALID');
          return;
        }

        const { hash, salt } = createLoginSecretHash(loginSecret);
        const user = store.createUser({
          displayName: displayName.length > 0 ? displayName : null,
          locale,
          loginSecretHash: hash,
          loginSecretSalt: salt,
        });

        const token = createSessionToken();
        const tokenHash = hashSessionToken(token, sessionPepper);
        const expiresAt = getSessionExpirationDate().toISOString();
        const session = store.createSession({ userId: user.id, tokenHash, expiresAt });
        const secureCookie =
          req.headers['x-forwarded-proto'] === 'https' ||
          requestUrl.protocol === 'https:';

        sendJson(
          res,
          201,
          {
            user: toPublicUser(user),
            session: { id: session.id, expiresAt: session.expiresAt },
          },
          buildSessionCookie(token, secureCookie),
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'BODY_INVALID') {
          sendError(res, 400, 'BODY_INVALID');
          return;
        }
        sendError(res, 500, 'INTERNAL_ERROR');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/account/login') {
      try {
        const body = await readJsonBody(req);
        const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
        const loginSecret =
          typeof body.loginSecret === 'string' ? body.loginSecret : '';
        if (!userId || !loginSecret) {
          sendError(res, 400, 'LOGIN_INVALID');
          return;
        }

        const user = store.findActiveUserById(userId);
        if (
          !user ||
          !verifyLoginSecret(loginSecret, user.loginSecretHash, user.loginSecretSalt)
        ) {
          sendError(res, 401, 'LOGIN_INVALID');
          return;
        }

        const token = createSessionToken();
        const tokenHash = hashSessionToken(token, sessionPepper);
        const expiresAt = getSessionExpirationDate().toISOString();
        const session = store.createSession({ userId: user.id, tokenHash, expiresAt });
        const secureCookie =
          req.headers['x-forwarded-proto'] === 'https' ||
          requestUrl.protocol === 'https:';

        sendJson(
          res,
          200,
          {
            user: toPublicUser(user),
            session: { id: session.id, expiresAt: session.expiresAt },
          },
          buildSessionCookie(token, secureCookie),
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'BODY_INVALID') {
          sendError(res, 400, 'BODY_INVALID');
          return;
        }
        sendError(res, 500, 'INTERNAL_ERROR');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/account/logout') {
      const auth = await requireAuthContext(req, store, sessionPepper);
      if (auth.ok) {
        store.revokeSessionByTokenHash(auth.tokenHash);
      }
      const secureCookie =
        req.headers['x-forwarded-proto'] === 'https' ||
        requestUrl.protocol === 'https:';
      sendJson(res, 200, { ok: true }, buildSessionCookieClear(secureCookie));
      return;
    }

    if (req.method === 'DELETE' && pathname === '/api/account') {
      const auth = await requireAuthContext(req, store, sessionPepper);
      if (!auth.ok) {
        sendError(res, 401, 'UNAUTHORIZED');
        return;
      }

      store.deleteAccount(auth.user.id);
      const secureCookie =
        req.headers['x-forwarded-proto'] === 'https' ||
        requestUrl.protocol === 'https:';
      sendJson(res, 200, { ok: true }, buildSessionCookieClear(secureCookie));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/connectors/providers') {
      const auth = await requireAuthContext(req, store, sessionPepper);
      const providers = SUPPORTED_CONNECTOR_PROVIDERS.map((provider) => ({
        provider,
        state: auth.ok
          ? store.getProviderState(auth.user.id, provider)
          : 'disconnected',
        configured: false,
      }));
      sendJson(res, 200, { providers });
      return;
    }

    const connectorPrefix = '/api/connectors/';
    if (pathname.startsWith(connectorPrefix)) {
      const suffix = pathname.slice(connectorPrefix.length);
      const parts = suffix.split('/').filter(Boolean);
      const provider = parts[0];

      if (!SUPPORTED_CONNECTOR_PROVIDERS.includes(provider)) {
        sendError(res, 404, 'CONNECTOR_NOT_FOUND');
        return;
      }

      if (req.method === 'GET' && parts.length === 2 && parts[1] === 'status') {
        const auth = await requireAuthContext(req, store, sessionPepper);
        const state = auth.ok
          ? store.getProviderState(auth.user.id, provider)
          : 'disconnected';
        sendJson(res, 200, { provider, state, configured: false });
        return;
      }

      if (req.method === 'GET' && parts.length === 2 && parts[1] === 'consents') {
        const auth = await requireAuthContext(req, store, sessionPepper);
        if (!auth.ok) {
          sendError(res, 401, 'UNAUTHORIZED');
          return;
        }
        sendJson(res, 200, {
          provider,
          consents: store.listActiveConsents(auth.user.id, provider),
        });
        return;
      }

      if (req.method === 'POST' && parts.length === 2 && parts[1] === 'consents') {
        const auth = await requireAuthContext(req, store, sessionPepper);
        if (!auth.ok) {
          sendError(res, 401, 'UNAUTHORIZED');
          return;
        }

        try {
          const body = await readJsonBody(req);
          const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
          const evidence =
            typeof body.evidence === 'string' ? body.evidence.trim() : '';
          const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : null;
          const scopes = normalizeScopes(body.scopes);

          if (!purpose || purpose.length > 100) {
            sendError(res, 400, 'PURPOSE_INVALID');
            return;
          }
          if (!evidence || evidence.length > 500) {
            sendError(res, 400, 'EVIDENCE_INVALID');
            return;
          }

          const consent = store.createConsent({
            userId: auth.user.id,
            provider,
            purpose,
            scopes,
            evidence,
            expiresAt,
          });
          sendJson(res, 201, { provider, consent });
        } catch (error) {
          if (error instanceof Error && error.message === 'BODY_INVALID') {
            sendError(res, 400, 'BODY_INVALID');
            return;
          }
          sendError(res, 500, 'INTERNAL_ERROR');
        }
        return;
      }

      if (
        req.method === 'DELETE' &&
        parts.length === 3 &&
        parts[1] === 'consents' &&
        parts[2].length > 0
      ) {
        const auth = await requireAuthContext(req, store, sessionPepper);
        if (!auth.ok) {
          sendError(res, 401, 'UNAUTHORIZED');
          return;
        }

        const revoked = store.revokeConsent(parts[2], auth.user.id, provider);
        if (!revoked) {
          sendError(res, 404, 'CONSENT_NOT_FOUND');
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        parts.length === 2 &&
        (parts[1] === 'connect' || parts[1] === 'revoke')
      ) {
        const auth = await requireAuthContext(req, store, sessionPepper);
        if (!auth.ok) {
          sendError(res, 401, 'UNAUTHORIZED');
          return;
        }

        const connector = getConnector(provider);
        if (!connector) {
          sendError(res, 404, 'CONNECTOR_NOT_FOUND');
          return;
        }

        try {
          if (parts[1] === 'connect') {
            await connector.connect({ userId: auth.user.id });
          } else {
            await connector.revoke({ userId: auth.user.id });
          }
          sendJson(res, 200, { ok: true });
        } catch (error) {
          if (error instanceof ConnectorNotConfiguredError) {
            sendError(res, 501, 'CONNECTOR_NOT_CONFIGURED', null, {
              provider,
              state: store.getProviderState(auth.user.id, provider),
            });
            return;
          }
          sendError(res, 500, 'CONNECTOR_ERROR');
        }
        return;
      }
    }

    await aiHandler(req, res);
  };
}
