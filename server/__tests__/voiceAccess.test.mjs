import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppHandler } from '../accountServer.mjs';
import { createAccountStore } from '../store/createStore.mjs';
import { verifyAccessToken } from '../../voice-service/src/access.ts';
import {
  VOICE_ACCESS_LIFETIME_SECONDS,
  voiceAccessSubject,
  issueGuestVoiceAccessToken,
} from '../voiceAccess.mjs';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'offline-test-access-secret-0123456789abcdef';

async function withServer(voiceAccessSecret, callback, guestOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'meditacion-voice-token-'));
  const store = await createAccountStore({
    fallbackPath: join(dir, 'app-store.json'),
    forceEngine: 'json',
  });
  const server = createServer(
    createAppHandler({
      store,
      sessionPepper: 'test-pepper',
      ai: { apiKey: '' },
      voiceAccessSecret,
      ...guestOptions,
    }),
  );
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const post = (base, path, cookie = '', body = undefined) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

async function register(base) {
  const response = await post(base, '/api/account/register', '', {
    displayName: 'Persona',
    locale: 'es-AR',
    loginSecret: 'segura-1234',
  });
  expect(response.status).toBe(201);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie') ?? '', userId: body.user.id };
}

describe('voice access token', () => {
  it('preserves the deployed voice verifier contract, expiry and tamper rejection', () => {
    const now = Date.UTC(2026, 9, 29, 12);
    const { token } = issueGuestVoiceAccessToken('198.51.100.1', SECRET, now);
    const subject = token.split('.')[2];
    expect(verifyAccessToken(token, SECRET, now)).toBe(subject);
    expect(
      verifyAccessToken(token, SECRET, now + VOICE_ACCESS_LIFETIME_SECONDS * 1000),
    ).toBeNull();
    expect(verifyAccessToken(`${token.slice(0, -1)}!`, SECRET, now)).toBeNull();
    expect(verifyAccessToken(token, `${SECRET}-different`, now)).toBeNull();
  });
  it('allows opted-in guests through the existing client route without creating an account', async () => {
    await withServer(
      SECRET,
      async (base) => {
        const response = await post(base, '/api/account/voice-token');
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        const access = await response.json();
        expect(access.guest).toBe(true);
        const [version, exp, subject, signature] = access.token.split('.');
        expect(version).toBe('v1');
        expect(subject).toBe(
          issueGuestVoiceAccessToken('127.0.0.1', SECRET).token.split('.')[2],
        );
        expect(signature).toBe(
          createHmac('sha256', SECRET)
            .update(`v1.${exp}.${subject}`)
            .digest('base64url'),
        );
        const status = await (await fetch(`${base}/api/account/status`)).json();
        expect(status.authenticated).toBe(false);
        const missingOrigin = await fetch(`${base}/api/account/voice-token`, {
          method: 'POST',
        });
        expect(missingOrigin.status).toBe(403);
      },
      { voiceGuestsEnabled: true, voiceTrustFlyProxy: false },
    );
  });

  it('uses only the Fly proxy header when deployed, ignoring arbitrary forwarded addresses', async () => {
    await withServer(
      SECRET,
      async (base) => {
        const url = `${base}/api/account/voice-token`;
        expect((await post(base, '/api/account/voice-token')).status).toBe(403);
        const opts = {
          method: 'POST',
          headers: {
            Origin: ORIGIN,
            'Fly-Client-IP': '198.51.100.1',
            'X-Forwarded-For': '203.0.113.10',
          },
        };
        const result = await fetch(url, opts);
        expect(result.status).toBe(200);
        const { token } = await result.json();
        expect(token.split('.')[2]).toBe(
          issueGuestVoiceAccessToken('198.51.100.1', SECRET).token.split('.')[2],
        );
      },
      { voiceGuestsEnabled: true, voiceTrustFlyProxy: true },
    );
  });

  it('matches the paid server daily HMAC contract and normalizes IPs without persisting them', () => {
    const now = Date.UTC(2026, 9, 9, 12);
    const access = issueGuestVoiceAccessToken('198.51.100.1', SECRET, now);
    const expected =
      'guest_' +
      createHmac('sha256', SECRET)
        .update('pausa-mia-guest-voice-v1:2026-10-09:198.51.100.1')
        .digest('base64url');
    expect(access.token.split('.')[2]).toBe(expected);
    expect(
      issueGuestVoiceAccessToken('::ffff:198.51.100.1', SECRET, now).token.split(
        '.',
      )[2],
    ).toBe(expected);
    expect(
      issueGuestVoiceAccessToken('2001:db8::1', SECRET, now).token.split('.')[2],
    ).toBe(
      issueGuestVoiceAccessToken('2001:0db8:0:0:0:0:0:1', SECRET, now).token.split(
        '.',
      )[2],
    );
    expect(
      issueGuestVoiceAccessToken(
        '198.51.100.1',
        SECRET,
        now + 12 * 3600_000,
      ).token.split('.')[2],
    ).not.toBe(expected);
    expect(issueGuestVoiceAccessToken('bad,198.51.100.1', SECRET, now)).toBeNull();
  });
  it('requires a signed-in session', async () => {
    await withServer(SECRET, async (base) => {
      const response = await post(base, '/api/account/voice-token');
      expect(response.status).toBe(401);
    });
  });

  it('stays unavailable without a strong configured secret', async () => {
    await withServer('short', async (base) => {
      const { cookie } = await register(base);
      const response = await post(base, '/api/account/voice-token', cookie);
      expect(response.status).toBe(503);
    });
  });

  it('issues a short-lived token with an opaque subject the voice service can verify', async () => {
    await withServer(SECRET, async (base) => {
      const { cookie, userId } = await register(base);
      const response = await post(base, '/api/account/voice-token', cookie);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const { token, expiresAt } = await response.json();
      const [version, exp, subject, signature] = token.split('.');
      expect(version).toBe('v1');
      expect(subject).toBe(voiceAccessSubject(userId, SECRET));
      expect(subject).not.toContain(String(userId));
      const expected = createHmac('sha256', SECRET)
        .update(`v1.${exp}.${subject}`)
        .digest('base64url');
      expect(signature).toBe(expected);
      const lifetime = Number(exp) - Math.floor(Date.now() / 1000);
      expect(lifetime).toBeGreaterThan(0);
      expect(lifetime).toBeLessThanOrEqual(VOICE_ACCESS_LIFETIME_SECONDS);
      expect(new Date(expiresAt).getTime()).toBe(Number(exp) * 1000);
    });
  });
});
