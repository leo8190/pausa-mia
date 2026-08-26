import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { validateText } from '../src/limits.ts';
import { buildPiperCliArgs } from '../src/piper.ts';
import { createVoiceServer } from '../src/server.ts';
import { buildSilentWav, wrapPcm16MonoToWav } from '../src/wav.ts';

const voiceServiceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

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

  it('wraps raw PCM from piper --output_raw as WAV', () => {
    const pcm = Buffer.from([0, 0, 1, 0]);
    const wav = wrapPcm16MonoToWav(pcm, 22050);
    assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 22050);
    assert.equal(wav.subarray(44).equals(pcm), true);
  });
});

describe('voice-service piper CLI', () => {
  it('passes --model, --config, serene --length_scale and --output_raw', () => {
    assert.deepEqual(
      buildPiperCliArgs({
        modelPath: '/models/es_AR-daniela-high.onnx',
        configPath: '/models/es_AR-daniela-high.onnx.json',
        lengthScale: 1.28,
      }),
      [
        '--model',
        '/models/es_AR-daniela-high.onnx',
        '--config',
        '/models/es_AR-daniela-high.onnx.json',
        '--length_scale',
        '1.28',
        '--output_raw',
      ],
    );
  });
});

describe('voice-service Docker image recipe', () => {
  it('installs piper-tts and bakes es_AR-daniela-high into /models', () => {
    const dockerfile = readFileSync(join(voiceServiceRoot, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /piper-tts==1\.6\.0/);
    assert.match(dockerfile, /ARG HF_REVISION/);
    assert.match(dockerfile, /\/models/);
    assert.match(dockerfile, /es_AR-daniela-high\.onnx/);
    assert.match(dockerfile, /es_AR-daniela-high\.onnx\.json/);
    assert.match(dockerfile, /huggingface\.co\/rhasspy\/piper-voices/);
    assert.equal(/^VOLUME\b/m.test(dockerfile), false);
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

  it('can require Origin for CORS in production mode', async () => {
    const config = loadConfig({
      PORT: '0',
      ARG_TTS_BACKEND: 'mock',
      ARG_ALLOWED_ORIGINS: 'http://localhost:5173',
      ARG_REQUIRE_ORIGIN: 'true',
      ARG_MAX_TEXT_CHARS: '800',
    });
    const server = createVoiceServer(config);
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    const missingOrigin = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'Respirá.' }),
    });
    assert.equal(missingOrigin.status, 403);
    const missingOriginBody = (await missingOrigin.json()) as { code: string };
    assert.equal(missingOriginBody.code, 'cors_denied');

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const preflight = await fetch(`${base}/v1/tts`, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);

    const withOrigin = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ text: 'Respirá.' }),
    });
    assert.equal(withOrigin.status, 200);

    server.close();
    await once(server, 'close');
  });

  it('rate limits POST /v1/tts per client and returns Retry-After', async () => {
    const config = loadConfig({
      PORT: '0',
      ARG_TTS_BACKEND: 'mock',
      ARG_ALLOWED_ORIGINS: 'http://localhost:5173',
      ARG_TTS_RATE_LIMIT_PER_MINUTE: '2',
      ARG_MAX_TEXT_CHARS: '800',
    });
    const server = createVoiceServer(config);
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      'fly-client-ip': '203.0.113.10',
    };

    const req1 = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: 'Respirá 1.' }),
    });
    assert.equal(req1.status, 200);

    const req2 = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: 'Respirá 2.' }),
    });
    assert.equal(req2.status, 200);

    const limited = await fetch(`${base}/v1/tts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: 'Respirá 3.' }),
    });
    assert.equal(limited.status, 429);
    const retryAfterRaw = limited.headers.get('retry-after');
    assert.ok(retryAfterRaw);
    assert.ok(Number.parseInt(retryAfterRaw ?? '0', 10) >= 1);
    const limitedBody = (await limited.json()) as { code: string };
    assert.equal(limitedBody.code, 'rate_limited');

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const preflight = await fetch(`${base}/v1/tts`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
      },
    });
    assert.equal(preflight.status, 204);

    server.close();
    await once(server, 'close');
  });
});
