import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tokens are short-lived so a leaked one cannot drain the paid budget for long. */
export const MAX_ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
export const MIN_ACCESS_SECRET_LENGTH = 32;

const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Issued by the account API to a signed-in person (never by the browser).
 * Format: v1.<expiresAtSeconds>.<opaqueSubject>.<hmac>
 */
export function issueAccessToken(
  subject: string,
  secret: string,
  nowMs: number = Date.now(),
  lifetimeSeconds: number = MAX_ACCESS_TOKEN_LIFETIME_SECONDS,
): string {
  if (!SUBJECT_PATTERN.test(subject)) throw new Error('invalid_subject');
  if (secret.length < MIN_ACCESS_SECRET_LENGTH) throw new Error('weak_secret');
  const expiresAt = Math.floor(nowMs / 1000) + lifetimeSeconds;
  const payload = `v1.${expiresAt}.${subject}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the opaque subject for a valid, unexpired token, or null. */
export function verifyAccessToken(
  token: string | undefined,
  secret: string | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!token || !secret || secret.length < MIN_ACCESS_SECRET_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const [, expRaw, subject, signature] = parts;
  if (!/^\d{1,12}$/.test(expRaw) || !SUBJECT_PATTERN.test(subject)) return null;
  const expected = Buffer.from(sign(`v1.${expRaw}.${subject}`, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  const nowSeconds = Math.floor(nowMs / 1000);
  const expiresAt = Number(expRaw);
  if (expiresAt <= nowSeconds) return null;
  if (expiresAt > nowSeconds + MAX_ACCESS_TOKEN_LIFETIME_SECONDS) return null;
  return subject;
}

export function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header ?? '');
  return match?.[1];
}
