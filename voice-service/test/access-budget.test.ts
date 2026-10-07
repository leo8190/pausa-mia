import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  MAX_ACCESS_TOKEN_LIFETIME_SECONDS,
  bearerToken,
  issueAccessToken,
  verifyAccessToken,
} from '../src/access.ts';
import { DailyCharBudget } from '../src/budget.ts';
import { loadConfig } from '../src/config.ts';
import {
  HEYGEN_SPEECH_URL,
  LEONARDO_DELIVERY_SPEED,
  LEONARDO_VOICE_ID,
  type HeygenFetch,
} from '../src/heygen.ts';
import { createVoiceServer } from '../src/server.ts';
import { buildSilentWav } from '../src/wav.ts';

const SECRET = 'offline-test-access-secret-0123456789abcdef';
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const TEXT = 'Respirá suave. No necesitás cambiar nada ahora.';
const CDN_URL = `https://resource2.heygen.ai/text_to_speech/job/${LEONARDO_VOICE_ID}/sample.wav`;

describe('Leonardo access tokens', () => {
  it('accepts only a correctly signed, unexpired, short-lived token', () => {
    const token = issueAccessToken('subject-abc', SECRET, NOW);
    assert.equal(verifyAccessToken(token, SECRET, NOW), 'subject-abc');
    assert.equal(verifyAccessToken(token, `${SECRET}x`, NOW), null);
    assert.equal(verifyAccessToken(token, 'short', NOW), null);
    assert.equal(verifyAccessToken(undefined, SECRET, NOW), null);
    assert.equal(
      verifyAccessToken(token, SECRET, NOW + MAX_ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
      null,
    );
    const tampered = token.replace('subject-abc', 'subject-xyz');
    assert.equal(verifyAccessToken(tampered, SECRET, NOW), null);
    const tooLong = issueAccessToken('subject-abc', SECRET, NOW, 24 * 3600);
    assert.equal(verifyAccessToken(tooLong, SECRET, NOW), null);
    assert.throws(() => issueAccessToken('bad subject', SECRET, NOW));
    assert.throws(() => issueAccessToken('subject-abc', 'short', NOW));
  });

  it('parses only a plain bearer header', () => {
    assert.equal(bearerToken('Bearer v1.1.abcdefgh.sig'), 'v1.1.abcdefgh.sig');
    assert.equal(bearerToken('Basic abc'), undefined);
    assert.equal(bearerToken('Bearer a b'), undefined);
    assert.equal(bearerToken(undefined), undefined);
  });
});

describe('Leonardo daily character budget', () => {
  it('reserves until the ceiling and resets on the next UTC day', () => {
    let now = NOW;
    const budget = new DailyCharBudget(100, undefined, () => now);
    assert.deepEqual(budget.reserve(60), { ok: true });
    const denied = budget.reserve(41);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.retryAfterSeconds, 12 * 3600);
    assert.deepEqual(budget.reserve(40), { ok: true });
    now += 12 * 3600 * 1000;
    assert.deepEqual(budget.reserve(100), { ok: true });
  });

  it('is disabled at zero and persists across restarts', () => {
    assert.equal(new DailyCharBudget(0, undefined, () => NOW).reserve(1).ok, false);
    const file = join(mkdtempSync(join(tmpdir(), 'pausa-budget-')), 'nested', 'budget.json');
    assert.equal(new DailyCharBudget(100, file, () => NOW).reserve(70).ok, true);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
      day: '2026-10-07',
      usedChars: 70,
    });
    const restarted = new DailyCharBudget(100, file, () => NOW);
    assert.equal(restarted.reserve(31).ok, false);
    assert.equal(restarted.reserve(30).ok, true);
  });

  it('fails closed when the persisted counter is corrupt', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pausa-budget-')), 'budget.json');
    writeFileSync(file, '{"day":"2026-10-07","usedChars":-5}');
    assert.equal(new DailyCharBudget(100, file, () => NOW).reserve(1).ok, false);
    writeFileSync(file, 'not json');
    assert.equal(new DailyCharBudget(100, file, () => NOW).reserve(1).ok, false);
  });
});

describe('Leonardo endpoint auth and spend control (offline fake HTTP only)', () => {
  async function withServer(
    budgetChars: string,
    run: (base: string, calls: string[]) => Promise<void>,
  ) {
    const calls: string[] = [];
    const fetcher: HeygenFetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === HEYGEN_SPEECH_URL) return Response.json({ data: { audio_url: CDN_URL } });
      return new Response(buildSilentWav({ durationMs: 200 }), {
        headers: { 'Content-Type': 'audio/wav' },
      });
    };
    const config = loadConfig({
      LEONARDO_TTS_ENABLED: 'true',
      LEONARDO_GENERATION_VERIFIED: 'true',
      HEYGEN_API_KEY: 'offline-test-placeholder',
      LEONARDO_ACCESS_SECRET: SECRET,
      LEONARDO_DAILY_CHAR_BUDGET: budgetChars,
      ARG_TTS_BACKEND: 'mock',
      ARG_ALLOWED_ORIGINS: 'https://localhost',
      ARG_REQUIRE_ORIGIN: 'true',
    });
    const server = createVoiceServer(config, { heygenFetch: fetcher });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls);
    } finally {
      server.close();
      await once(server, 'close');
    }
  }

  const post = (base: string, authorization?: string) =>
    fetch(`${base}/v1/leonardo/tts`, {
      method: 'POST',
      headers: {
        Origin: 'https://localhost',
        'Content-Type': 'application/json',
        'X-Pausa-Voice-Consent': 'session',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({
        text: TEXT,
        voiceId: LEONARDO_VOICE_ID,
        deliverySpeed: LEONARDO_DELIVERY_SPEED,
      }),
    });

  it('rejects missing or forged tokens before any provider call', async () => {
    await withServer('5000', async (base, calls) => {
      const missing = await post(base);
      assert.equal(missing.status, 401);
      assert.equal((await missing.json()).code, 'auth_required');
      const forged = issueAccessToken('subject-abc', `${SECRET}-other`);
      assert.equal((await post(base, `Bearer ${forged}`)).status, 401);
      assert.deepEqual(calls, []);
    });
  });

  it('stops paid calls once the daily character budget is spent', async () => {
    await withServer(String(TEXT.length * 2), async (base, calls) => {
      const auth = `Bearer ${issueAccessToken('subject-abc', SECRET)}`;
      assert.equal((await post(base, auth)).status, 200);
      assert.equal((await post(base, auth)).status, 200);
      const over = await post(base, auth);
      assert.equal(over.status, 429);
      assert.equal((await over.json()).code, 'budget_exhausted');
      assert.ok(Number(over.headers.get('Retry-After')) > 0);
      assert.equal(calls.filter((url) => url === HEYGEN_SPEECH_URL).length, 2);
    });
  });
});
