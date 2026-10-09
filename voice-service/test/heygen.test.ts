import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { issueAccessToken } from '../src/access.ts';
import { loadConfig } from '../src/config.ts';
import { createVoiceServer } from '../src/server.ts';
import { buildSilentWav } from '../src/wav.ts';
import {
  HEYGEN_SPEECH_URL,
  HeygenError,
  LEONARDO_DELIVERY_SPEED,
  LEONARDO_VOICE_ID,
  MAX_LEONARDO_AUDIO_BYTES,
  leonardoGenerationVerified,
  synthesizeLeonardoAudio,
  type HeygenFetch,
} from '../src/heygen.ts';

const SAMPLE_TEXT = 'Respirá suave. No necesitás cambiar nada ahora.';
const CDN_URL = `https://resource2.heygen.ai/text_to_speech/job/${LEONARDO_VOICE_ID}/sample.wav`;
const TEST_CONFIG = {
  LEONARDO_TTS_ENABLED: 'true',
  LEONARDO_GENERATION_VERIFIED: 'true',
  HEYGEN_API_KEY: 'offline-test-placeholder',
  LEONARDO_ACCESS_SECRET: 'offline-test-access-secret-0123456789abcdef',
  LEONARDO_DAILY_CHAR_BUDGET: '5000',
  ARG_TTS_BACKEND: 'mock',
  ARG_ALLOWED_ORIGINS: 'https://localhost',
  ARG_REQUIRE_ORIGIN: 'true',
};
const REQUEST_BODY = {
  text: SAMPLE_TEXT,
  voiceId: LEONARDO_VOICE_ID,
  deliverySpeed: LEONARDO_DELIVERY_SPEED,
};
const REQUEST_HEADERS = {
  Origin: 'https://localhost',
  'Content-Type': 'application/json',
  'X-Pausa-Voice-Consent': 'session',
  Authorization: `Bearer ${issueAccessToken('offline-subject-1', TEST_CONFIG.LEONARDO_ACCESS_SECRET)}`,
};
function fakeProvider(
  result: unknown = { data: { audio_url: CDN_URL } },
  audio = new Response(buildSilentWav({ durationMs: 200 }), {
    headers: { 'Content-Type': 'audio/wav' },
  }),
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: HeygenFetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === HEYGEN_SPEECH_URL) return Response.json(result);
    return audio;
  };
  return { calls, fetcher };
}
async function withServer(
  env: NodeJS.ProcessEnv,
  fetcher: HeygenFetch,
  run: (base: string) => Promise<void>,
) {
  const server = createVoiceServer(loadConfig(env), { heygenFetch: fetcher });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

describe('Leonardo configuration', () => {
  it('stays disabled unless opted in, own key, access secret, daily budget and manual verification are configured', () => {
    assert.equal(leonardoGenerationVerified(loadConfig({})), false);
    for (const field of [
      'LEONARDO_TTS_ENABLED',
      'LEONARDO_GENERATION_VERIFIED',
      'HEYGEN_API_KEY',
      'LEONARDO_ACCESS_SECRET',
      'LEONARDO_DAILY_CHAR_BUDGET',
    ]) {
      const env = { ...TEST_CONFIG, [field]: '' };
      assert.equal(leonardoGenerationVerified(loadConfig(env)), false);
    }
    assert.equal(leonardoGenerationVerified(loadConfig(TEST_CONFIG)), true);
  });
});

describe('HeyGen adapter (offline fake HTTP only)', () => {
  it('requests the approved clone with Orca at0.85 es-AR and never sends its API key to the CDN', async () => {
    const { calls, fetcher } = fakeProvider();
    const result = await synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
      fetch: fetcher,
    });
    assert.equal(result.contentType, 'audio/wav');
    assert.equal(result.bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, HEYGEN_SPEECH_URL);
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      text: SAMPLE_TEXT,
      voice_id: LEONARDO_VOICE_ID,
      engine: 'orca',
      speed: 0.85,
      language: 'es',
      locale: 'es-AR',
      input_type: 'text',
    });
    assert.equal(
      new Headers(calls[0].init?.headers).get('X-Api-Key'),
      TEST_CONFIG.HEYGEN_API_KEY,
    );
    assert.equal(calls[1].url, CDN_URL);
    assert.equal(new Headers(calls[1].init?.headers).get('X-Api-Key'), null);
    for (const call of calls) {
      assert.equal(call.init?.redirect, 'error');
      assert.equal(call.init?.credentials, 'omit');
    }
  });

  it('rejects a substituted speech engine before downloading audio, without a retry', async () => {
    for (const engine of ['starfish', 'elevenlabs', null]) {
      const { calls, fetcher } = fakeProvider({
        data: { audio_url: CDN_URL, voice_id: LEONARDO_VOICE_ID, engine },
      });
      await assert.rejects(
        synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
          fetch: fetcher,
        }),
        (error: unknown) =>
          error instanceof HeygenError && error.code === 'provider_engine_mismatch',
      );
      assert.equal(calls.length, 1);
    }
    const { fetcher } = fakeProvider({ data: { audio_url: CDN_URL, engine: 'orca' } });
    assert.equal(
      (
        await synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
          fetch: fetcher,
        })
      ).contentType,
      'audio/wav',
    );
  });

  it('also accepts a flat provider response but never substitutes another voice', async () => {
    const { fetcher } = fakeProvider({ audio_url: CDN_URL });
    assert.equal(
      (
        await synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
          fetch: fetcher,
        })
      ).contentType,
      'audio/wav',
    );
    const mismatch = fakeProvider({
      data: { audio_url: CDN_URL, voice_id: 'another-speaker' },
    });
    await assert.rejects(
      synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
        fetch: mismatch.fetcher,
      }),
      (error: unknown) =>
        error instanceof HeygenError && error.code === 'provider_identity_mismatch',
    );
    assert.equal(mismatch.calls.length, 1);
  });

  it('rejects non-approved download hosts, insecure URLs, credentials and missing voice evidence', async () => {
    for (const audio_url of [
      'https://evil.example/audio.wav',
      'http://resource2.heygen.ai/audio.wav',
      `https://key@resource2.heygen.ai/${LEONARDO_VOICE_ID}/audio.wav`,
      `https://resource2.heygen.ai:8443/${LEONARDO_VOICE_ID}/audio.wav`,
      'https://resource2.heygen.ai/other-speaker/audio.wav',
    ]) {
      const { fetcher, calls } = fakeProvider({ data: { audio_url } });
      await assert.rejects(
        synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
          fetch: fetcher,
        }),
        HeygenError,
      );
      assert.equal(calls.length, 1);
    }
  });

  it('sanitizes provider failures and never retries a billed request', async () => {
    let count = 0;
    const fail: HeygenFetch = async () => {
      count++;
      throw new Error(`${SAMPLE_TEXT} private-api-value`);
    };
    await assert.rejects(
      synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), { fetch: fail }),
      (error: unknown) =>
        error instanceof HeygenError &&
        error.code === 'provider_connection_failed' &&
        !error.message.includes(SAMPLE_TEXT) &&
        !error.message.includes('private-api-value'),
    );
    assert.equal(count, 1);
    const responseFailure: HeygenFetch = async () => {
      count++;
      return new Response('provider private detail', { status: 401 });
    };
    await assert.rejects(
      synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
        fetch: responseFailure,
      }),
      (error: unknown) =>
        error instanceof HeygenError && error.code === 'provider_generation_failed',
    );
    assert.equal(count, 2);
  });

  it('serves MP3 as audio/mpeg even when the provider labels its .wav URL audio/wav', async () => {
    const bytes = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40)]);
    const fake = fakeProvider(
      undefined,
      new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } }),
    );
    const result = await synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
      fetch: fake.fetcher,
    });
    assert.equal(result.contentType, 'audio/mpeg');
    assert.equal(result.bytes.equals(bytes), true);
  });

  it('rejects invalid audio and oversized streamed or declared downloads', async () => {
    const invalid = fakeProvider(
      undefined,
      new Response('not audio', { headers: { 'Content-Type': 'audio/wav' } }),
    );
    await assert.rejects(
      synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
        fetch: invalid.fetcher,
      }),
      (error: unknown) =>
        error instanceof HeygenError && error.code === 'provider_invalid_audio',
    );
    for (const declared of [true, false]) {
      const fake = fakeProvider(
        undefined,
        new Response(new Uint8Array(MAX_LEONARDO_AUDIO_BYTES + 1), {
          headers: {
            'Content-Type': 'audio/wav',
            ...(declared
              ? { 'Content-Length': String(MAX_LEONARDO_AUDIO_BYTES + 1) }
              : {}),
          },
        }),
      );
      await assert.rejects(
        synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
          fetch: fake.fetcher,
        }),
        (error: unknown) =>
          error instanceof HeygenError && error.code === 'provider_response_too_large',
      );
    }
  });

  it('aborts before generation or during a live fetch without retrying', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const fake = fakeProvider();
    await assert.rejects(
      synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
        fetch: fake.fetcher,
        signal: aborted.signal,
      }),
      (error: unknown) =>
        error instanceof HeygenError && error.code === 'generation_cancelled',
    );
    assert.equal(fake.calls.length, 0);
    const controller = new AbortController();
    let calls = 0;
    const interrupted: HeygenFetch = async (_input, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        });
        controller.abort();
      });
    };
    await assert.rejects(
      synthesizeLeonardoAudio(SAMPLE_TEXT, loadConfig(TEST_CONFIG), {
        fetch: interrupted,
        signal: controller.signal,
      }),
      (error: unknown) =>
        error instanceof HeygenError && error.code === 'generation_cancelled',
    );
    assert.equal(calls, 1);
  });
});

describe('Leonardo HTTP boundary', () => {
  it('capabilities are free/read-only and default false; disabled POST never calls provider', async () => {
    const fake = fakeProvider();
    await withServer(
      { ARG_ALLOWED_ORIGINS: 'https://localhost' },
      fake.fetcher,
      async (base) => {
        const capability = await fetch(`${base}/v1/leonardo/capabilities`);
        assert.equal(capability.status, 200);
        assert.deepEqual(await capability.json(), {
          provider: 'heygen',
          voiceId: LEONARDO_VOICE_ID,
          deliverySpeed: 0.85,
          generationVerified: false,
        });
        const disabled = await fetch(`${base}/v1/leonardo/tts`, {
          method: 'POST',
          headers: REQUEST_HEADERS,
          body: JSON.stringify(REQUEST_BODY),
        });
        assert.equal(disabled.status, 503);
        assert.equal(fake.calls.length, 0);
      },
    );
  });

  it('rejects missing consent, Origin, invalid identity and oversized text before provider calls', async () => {
    const fake = fakeProvider();
    await withServer(TEST_CONFIG, fake.fetcher, async (base) => {
      const noConsent = await fetch(`${base}/v1/leonardo/tts`, {
        method: 'POST',
        headers: { Origin: 'https://localhost', 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY),
      });
      assert.equal(noConsent.status, 403);
      assert.equal(
        ((await noConsent.json()) as { code: string }).code,
        'consent_required',
      );
      const noOrigin = await fetch(`${base}/v1/leonardo/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pausa-Voice-Consent': 'session',
        },
        body: JSON.stringify(REQUEST_BODY),
      });
      assert.equal(noOrigin.status, 403);
      for (const body of [
        { ...REQUEST_BODY, voiceId: 'other' },
        { ...REQUEST_BODY, deliverySpeed: 1 },
        { ...REQUEST_BODY, language: 'en' },
        { ...REQUEST_BODY, text: 'x'.repeat(801) },
      ]) {
        const invalid = await fetch(`${base}/v1/leonardo/tts`, {
          method: 'POST',
          headers: REQUEST_HEADERS,
          body: JSON.stringify(body),
        });
        assert.equal(invalid.status, 400);
      }
      assert.equal(fake.calls.length, 0);
    });
  });

  it('returns actual audio with exposed identity headers and supports explicit consent preflight', async () => {
    const fake = fakeProvider();
    await withServer(TEST_CONFIG, fake.fetcher, async (base) => {
      const preflight = await fetch(`${base}/v1/leonardo/tts`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://localhost' },
      });
      assert.equal(preflight.status, 204);
      assert.match(
        preflight.headers.get('Access-Control-Allow-Headers') ?? '',
        /X-Pausa-Voice-Consent/,
      );
      const result = await fetch(`${base}/v1/leonardo/tts`, {
        method: 'POST',
        headers: REQUEST_HEADERS,
        body: JSON.stringify(REQUEST_BODY),
      });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('X-Pausa-Voice-Provider'), 'heygen');
      assert.equal(result.headers.get('X-Pausa-Voice-Id'), LEONARDO_VOICE_ID);
      assert.equal(result.headers.get('X-Pausa-Voice-Speed'), '0.85');
      assert.match(
        result.headers.get('Access-Control-Expose-Headers') ?? '',
        /X-Pausa-Voice-Id/,
      );
      assert.equal(result.headers.get('Cache-Control'), 'no-store');
      assert.equal(
        Buffer.from(await result.arrayBuffer())
          .subarray(0, 4)
          .toString('ascii'),
        'RIFF',
      );
    });
  });

  it('rate limits paid requests despite forged forwarded addresses and does not affect Piper', async () => {
    const fetcher: HeygenFetch = async (input) =>
      String(input) === HEYGEN_SPEECH_URL
        ? Response.json({ data: { audio_url: CDN_URL } })
        : new Response(buildSilentWav({ durationMs: 200 }), {
            headers: { 'Content-Type': 'audio/wav' },
          });
    await withServer(
      { ...TEST_CONFIG, ARG_TTS_RATE_LIMIT_PER_MINUTE: '1' },
      fetcher,
      async (base) => {
        const first = await fetch(`${base}/v1/leonardo/tts`, {
          method: 'POST',
          headers: { ...REQUEST_HEADERS, 'X-Forwarded-For': '203.0.113.1' },
          body: JSON.stringify(REQUEST_BODY),
        });
        assert.equal(first.status, 200);
        await first.arrayBuffer();
        const second = await fetch(`${base}/v1/leonardo/tts`, {
          method: 'POST',
          headers: { ...REQUEST_HEADERS, 'X-Forwarded-For': '203.0.113.2' },
          body: JSON.stringify(REQUEST_BODY),
        });
        assert.equal(second.status, 429);
        assert.ok(Number(second.headers.get('Retry-After')) >= 1);
        const piper = await fetch(`${base}/v1/tts`, {
          method: 'POST',
          headers: REQUEST_HEADERS,
          body: JSON.stringify({ text: 'Respirá.' }),
        });
        assert.equal(piper.status, 200);
      },
    );
  });
});
