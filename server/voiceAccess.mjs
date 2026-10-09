import { createHmac } from 'node:crypto';

// Must match voice-service/src/access.ts: v1.<expiresAtSeconds>.<subject>.<hmac>
export const VOICE_ACCESS_LIFETIME_SECONDS = 10 * 60;
export const MIN_VOICE_ACCESS_SECRET_LENGTH = 32;

export function isVoiceAccessConfigured(secret) {
  return typeof secret === 'string' && secret.length >= MIN_VOICE_ACCESS_SECRET_LENGTH;
}

/** Opaque per-account subject: the voice service never learns the account id. */
export function voiceAccessSubject(userId, secret) {
  return createHmac('sha256', secret)
    .update(`voice-subject:${userId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function issueVoiceAccessToken(userId, secret, nowMs = Date.now()) {
  if (!isVoiceAccessConfigured(secret)) throw new Error('VOICE_ACCESS_NOT_CONFIGURED');
  const expiresAt = Math.floor(nowMs / 1000) + VOICE_ACCESS_LIFETIME_SECONDS;
  const payload = `v1.${expiresAt}.${voiceAccessSubject(userId, secret)}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
