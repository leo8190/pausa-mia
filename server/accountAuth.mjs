import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE_NAME = 'meditacion_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashWithSalt(value, salt) {
  return sha256(`${salt}:${value}`);
}

const SCRYPT_PREFIX = 'scrypt';
const DEFAULT_SCRYPT_PARAMS = {
  N: 1 << 15,
  r: 8,
  p: 1,
  keyLength: 64,
};

function isHex(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length % 2 === 0 &&
    /^[0-9a-f]+$/i.test(value)
  );
}

function safeCompareHex(leftHex, rightHex) {
  if (!isHex(leftHex) || !isHex(rightHex)) return false;
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function deriveScryptHex(secret, salt, params) {
  const normalizedSalt = Buffer.from(salt, 'hex');
  const maxmem = Math.max(32 * 1024 * 1024, 128 * params.N * params.r * 2);
  return scryptSync(secret, normalizedSalt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem,
  }).toString('hex');
}

function serializeScryptHash(derivedHex, params) {
  return [
    SCRYPT_PREFIX,
    String(params.N),
    String(params.r),
    String(params.p),
    String(params.keyLength),
    derivedHex,
  ].join('$');
}

function parseScryptHash(hash) {
  if (typeof hash !== 'string') return null;
  const parts = hash.split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return null;
  const [_, NRaw, rRaw, pRaw, keyLengthRaw, derivedHex] = parts;
  const N = Number(NRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  const keyLength = Number(keyLengthRaw);
  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !Number.isInteger(keyLength)
  ) {
    return null;
  }
  if (N < 1024 || N > 1 << 20) return null;
  if (r < 1 || r > 32) return null;
  if (p < 1 || p > 16) return null;
  if (keyLength < 16 || keyLength > 128) return null;
  if (!isHex(derivedHex)) return null;
  return {
    params: { N, r, p, keyLength },
    derivedHex: derivedHex.toLowerCase(),
  };
}

export function createLoginSecretHash(secret) {
  const salt = randomBytes(16).toString('hex');
  const derivedHex = deriveScryptHex(secret, salt, DEFAULT_SCRYPT_PARAMS);
  const hash = serializeScryptHash(derivedHex, DEFAULT_SCRYPT_PARAMS);
  return { salt, hash };
}

export function verifyLoginSecret(secret, hash, salt) {
  if (typeof secret !== 'string' || typeof hash !== 'string' || typeof salt !== 'string') {
    return false;
  }

  if (hash.startsWith(`${SCRYPT_PREFIX}$`)) {
    if (!isHex(salt)) return false;
    const parsed = parseScryptHash(hash);
    if (!parsed) return false;
    const candidateHex = deriveScryptHex(secret, salt, parsed.params);
    return safeCompareHex(candidateHex, parsed.derivedHex);
  }

  // Formato legado SHA-256 + salt. Se mantiene solo para migración.
  const candidate = hashWithSalt(secret, salt);
  return safeCompareHex(candidate, hash.toLowerCase());
}

export function createSessionToken() {
  return randomBytes(32).toString('hex');
}

export function hashSessionToken(token, pepper) {
  return sha256(`${pepper}:${token}`);
}

export function getSessionExpirationDate() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
}

export function parseCookieHeader(rawCookieHeader) {
  const jar = {};
  if (!rawCookieHeader) return jar;
  for (const part of rawCookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    const value = rest.join('=');
    try {
      jar[name] = decodeURIComponent(value);
    } catch {
      jar[name] = value;
    }
  }
  return jar;
}

export function buildSessionCookie(token, isSecure = false) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildSessionCookieClear(isSecure = false) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}
