import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { validateText } from '../src/limits.ts';
import { createVoiceServer } from '../src/server.ts';
import { buildSilentWav } from '../src/wav.ts';

describe('voice-service limits', () => {
  it('rejects empty and oversized text', () => {
    assert.equal(validateText('', 10).ok, false);
    assert.equal(validateText('x'.repeat(11), 10).ok, false);
    const ok = validateText('  hola  ', 10);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.text, 'hola');
  });
});

describe('voice-service wav mock', () => {
  it('builds a deterministic RIFF/WAVE header', () => {
    const a = buildSilentWav({ sampleRate: 22050, durationMs: 200 });
    const b = buildSilentWav({ sampleRate: 22050, durationMs: 200 });
    assert.equal(a.equals(b), true);
    assert.equal(a.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(a.subarray(8, 12).toString('ascii'), 'WAVE');
  });
});

describe('voice-service HTTP', () => {
  it('health and tts mock return expected shapes', async () => {
    const config = loadConfig({
      PORT: '0',
      ARG_TTS_BACKEND: 'mock',
      ARG_ALLOWED_ORIGINS: 'http://localhost:5173',
      ARG_MAX_TEXT_CHARS: '800',
    });
    const server = createVoiceServer(config);
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const healthJson = (await health.json()) as { ok: boolean; backend: string };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.backend, 'mock');

    const denied = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ text: 'hola' }),
    });
    assert.equal(denied.status, 403);

    const tts = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ text: 'Respirá.' }),
    });
    assert.equal(tts.status, 200);
    assert.match(tts.headers.get('content-type') ?? '', /audio\/wav/);
    const buf = Buffer.from(await tts.arrayBuffer());
    assert.ok(buf.length > 44);
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF');

    const tooLong = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(801) }),
    });
    assert.equal(tooLong.status, 400);
    const err = (await tooLong.json()) as { code: string };
    assert.equal(err.code, 'text_too_long');

    server.close();
    await once(server, 'close');
  });
});
