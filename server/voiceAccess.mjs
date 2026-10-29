import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

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
  return issueSubjectToken(voiceAccessSubject(userId, secret), secret, nowMs);
}

/** Must match voice-service/src/guest-access.ts. No account, IP or secret is
 * stored; the paid server verifies the same connection/day on every request.
 */
export function issueGuestVoiceAccessToken(clientIp, secret, nowMs = Date.now()) {
  if (!isVoiceAccessConfigured(secret) || typeof clientIp !== 'string') return null;
  let ip = clientIp.trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const version = isIP(ip);
  if (!version) return null;
  if (version === 6) {
    try {
      ip = new URL(`http://[${ip}]`).hostname.slice(1, -1);
    } catch {
      return null;
    }
  }
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const subject = `guest_${createHmac('sha256', secret)
    .update(`pausa-mia-guest-voice-v1:${day}:${ip}`)
    .digest('base64url')}`;
  return { ...issueSubjectToken(subject, secret, nowMs), guest: true };
}

function issueSubjectToken(subject, secret, nowMs) {
  const expiresAt = Math.floor(nowMs / 1000) + VOICE_ACCESS_LIFETIME_SECONDS;
  const payload = `v1.${expiresAt}.${subject}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
