import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_CIPHER_ALGORITHM = 'aes-256-gcm';

function nowMs() {
  return Date.now();
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseScopes(rawScopes) {
  if (!Array.isArray(rawScopes)) return [];
  return rawScopes
    .filter((scope) => typeof scope === 'string')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
    .slice(0, 30);
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function validateEncryptionKey(rawKey) {
  if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    return null;
  }

  const trimmed = rawKey.trim();
  try {
    const key = Buffer.from(trimmed, 'base64');
    if (key.length === 32) {
      return key;
    }
  } catch {
    // continue with hex parsing below
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  return null;
}

function createCodeVerifier() {
  return base64UrlEncode(randomBytes(64));
}

function createCodeChallenge(verifier) {
  return base64UrlEncode(createHash('sha256').update(verifier).digest());
}

function buildAuthorizationUrl({ clientId, redirectUri, state, codeChallenge, scopes }) {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export function resolveGoogleOAuthConfig(env = process.env) {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
  const calendarRedirectUri = env.GOOGLE_OAUTH_REDIRECT_URI_CALENDAR?.trim() ?? '';
  const driveRedirectUri = env.GOOGLE_OAUTH_REDIRECT_URI_DRIVE?.trim() ?? '';
  const tokenKey = validateEncryptionKey(env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY ?? '');
  const tokenKid = env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KID?.trim() || 'local-key-v1';

  return {
    clientId,
    clientSecret,
    redirectUris: {
      google_calendar: calendarRedirectUri,
      google_drive: driveRedirectUri,
    },
    tokenEncryptionKey: tokenKey,
    tokenEncryptionKid: tokenKid,
  };
}

export function createGoogleOAuthService(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = options.config ?? resolveGoogleOAuthConfig(process.env);
  const stateTtlMs =
    Number.isFinite(options.stateTtlMs) && options.stateTtlMs > 0
      ? options.stateTtlMs
      : OAUTH_STATE_TTL_MS;
  const stateStore = new Map();

  function hasRequiredConfig(provider) {
    if (provider !== 'google_calendar' && provider !== 'google_drive') {
      return false;
    }
    return Boolean(
      config.clientId &&
        config.clientSecret &&
        config.redirectUris[provider] &&
        config.tokenEncryptionKey,
    );
  }

  function pruneExpiredStates() {
    const now = nowMs();
    for (const [state, record] of stateStore.entries()) {
      if (record.expiresAtMs <= now) {
        stateStore.delete(state);
      }
    }
  }

  function createStart({ userId, provider, scopes }) {
    if (!hasRequiredConfig(provider)) {
      throw new Error('OAUTH_PROVIDER_NOT_CONFIGURED');
    }

    pruneExpiredStates();
    const state = base64UrlEncode(randomBytes(32));
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const expiresAtMs = nowMs() + stateTtlMs;
    stateStore.set(state, {
      state,
      userId,
      provider,
      scopes,
      codeVerifier,
      expiresAtMs,
    });

    return {
      provider,
      authorizationUrl: buildAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUris[provider],
        state,
        codeChallenge,
        scopes,
      }),
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  function consumeState(state) {
    pruneExpiredStates();
    const record = stateStore.get(state);
    if (!record) return null;
    stateStore.delete(state);
    return record;
  }

  function encryptTokenPayload(payload) {
    if (!config.tokenEncryptionKey) {
      throw new Error('OAUTH_TOKEN_ENCRYPTION_NOT_CONFIGURED');
    }
    const iv = randomBytes(12);
    const aad = Buffer.from(`kid:${config.tokenEncryptionKid}`, 'utf-8');
    const cipher = createCipheriv(TOKEN_CIPHER_ALGORITHM, config.tokenEncryptionKey, iv);
    cipher.setAAD(aad);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      v: 1,
      alg: TOKEN_CIPHER_ALGORITHM,
      kid: config.tokenEncryptionKid,
      iv: iv.toString('base64'),
      aad: aad.toString('base64'),
      ciphertext: encrypted.toString('base64'),
      tag: tag.toString('base64'),
    });
  }

  function decryptTokenPayload(ciphertext) {
    if (!ciphertext) return null;
    if (!config.tokenEncryptionKey) {
      throw new Error('OAUTH_TOKEN_ENCRYPTION_NOT_CONFIGURED');
    }
    const parsed = JSON.parse(ciphertext);
    const iv = Buffer.from(parsed.iv, 'base64');
    const aad = Buffer.from(parsed.aad, 'base64');
    const tag = Buffer.from(parsed.tag, 'base64');
    const encrypted = Buffer.from(parsed.ciphertext, 'base64');
    const decipher = createDecipheriv(TOKEN_CIPHER_ALGORITHM, config.tokenEncryptionKey, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plaintext.toString('utf-8'));
  }

  async function exchangeCode({ code, state }) {
    if (!code || !state) {
      throw new Error('OAUTH_CALLBACK_INVALID');
    }
    const pending = consumeState(state);
    if (!pending) {
      throw new Error('OAUTH_STATE_INVALID');
    }
    if (!hasRequiredConfig(pending.provider)) {
      throw new Error('OAUTH_PROVIDER_NOT_CONFIGURED');
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('client_id', config.clientId);
    body.set('client_secret', config.clientSecret);
    body.set('redirect_uri', config.redirectUris[pending.provider]);
    body.set('code_verifier', pending.codeVerifier);

    const tokenRes = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
    }

    const tokenJson = await tokenRes.json();
    if (typeof tokenJson.access_token !== 'string' || tokenJson.access_token.length === 0) {
      throw new Error('OAUTH_TOKEN_RESPONSE_INVALID');
    }

    const now = nowMs();
    const expiresAt = Number.isFinite(tokenJson.expires_in)
      ? new Date(now + Number(tokenJson.expires_in) * 1000).toISOString()
      : null;
    const profile = decodeJwtPayload(tokenJson.id_token);
    const storedTokenPayload = {
      accessToken: tokenJson.access_token,
      refreshToken:
        typeof tokenJson.refresh_token === 'string' ? tokenJson.refresh_token : null,
      tokenType: typeof tokenJson.token_type === 'string' ? tokenJson.token_type : 'Bearer',
      scope:
        typeof tokenJson.scope === 'string'
          ? tokenJson.scope
          : Array.isArray(pending.scopes)
            ? pending.scopes.join(' ')
            : '',
      expiresAt,
      issuedAt: new Date(now).toISOString(),
    };

    return {
      userId: pending.userId,
      provider: pending.provider,
      scopes:
        typeof storedTokenPayload.scope === 'string'
          ? storedTokenPayload.scope
              .split(' ')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
          : pending.scopes,
      providerAccountRef:
        typeof profile?.sub === 'string'
          ? profile.sub
          : typeof profile?.email === 'string'
            ? profile.email
            : null,
      tokenCiphertext: encryptTokenPayload(storedTokenPayload),
      tokenKid: config.tokenEncryptionKid,
    };
  }

  async function revokeLinkedAccount(linkedAccount) {
    if (!linkedAccount?.tokenCiphertext) {
      return { ok: true };
    }
    const decrypted = decryptTokenPayload(linkedAccount.tokenCiphertext);
    const tokenToRevoke =
      decrypted?.refreshToken && decrypted.refreshToken.length > 0
        ? decrypted.refreshToken
        : decrypted?.accessToken;
    if (!tokenToRevoke) {
      return { ok: true };
    }

    const body = new URLSearchParams();
    body.set('token', tokenToRevoke);
    const response = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new Error('OAUTH_TOKEN_REVOKE_FAILED');
    }
    return { ok: true };
  }

  return {
    isProviderConfigured(provider) {
      return hasRequiredConfig(provider);
    },
    getMissingConfig(provider) {
      const missing = [];
      if (!config.clientId) missing.push('GOOGLE_OAUTH_CLIENT_ID');
      if (!config.clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
      if (!config.redirectUris[provider]) {
        missing.push(
          provider === 'google_calendar'
            ? 'GOOGLE_OAUTH_REDIRECT_URI_CALENDAR'
            : 'GOOGLE_OAUTH_REDIRECT_URI_DRIVE',
        );
      }
      if (!config.tokenEncryptionKey) {
        missing.push('GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY');
      }
      return missing;
    },
    getRedirectUri(provider) {
      return config.redirectUris[provider] ?? '';
    },
    parseScopes,
    createStart,
    exchangeCode,
    revokeLinkedAccount,
  };
}
