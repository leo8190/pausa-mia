import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppHandler } from '../accountServer.mjs';
import { createAccountStore } from '../store/createStore.mjs';
import { VOICE_ACCESS_LIFETIME_SECONDS, voiceAccessSubject } from '../voiceAccess.mjs';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'offline-test-access-secret-0123456789abcdef';

async function withServer(voiceAccessSecret, callback) {
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
