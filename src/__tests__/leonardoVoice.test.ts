import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEONARDO_DELIVERY_SPEED,
  LEONARDO_VOICE_ID,
  getLeonardoTtsEndpoint,
  synthesizeLeonardoVoice,
} from '../lib/leonardoVoice';

const endpoint = 'https://voice.example.test';
const approvedIdentity = {
  provider: 'heygen',
  voiceId: 'db2a543de8bd431899957059671861b4',
  deliverySpeed: 0.85,
  generationVerified: true,
};

function capabilities(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ...approvedIdentity, ...overrides }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ACCESS_TOKEN = 'v1.1999999999.opaqueSubject_123.c2lnbmF0dXJl';

function accessToken(status = 200) {
  return new Response(
    status === 200 ? JSON.stringify({ token: ACCESS_TOKEN, expiresAt: 'x' }) : null,
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

function recognizedAudioBytes(contentType: string) {
  const bytes = new Uint8Array(contentType === 'audio/wav' ? 46 : 12);
  if (contentType === 'audio/wav') {
    const view = new DataView(bytes.buffer);
    for (const [offset, text] of [
      [0, 'RIFF'],
      [8, 'WAVE'],
      [12, 'fmt '],
      [36, 'data'],
    ] as const) {
      [...text].forEach((character, index) => {
        bytes[offset + index] = character.charCodeAt(0);
      });
    }
    view.setUint32(4, 38, true);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(40, 2, true);
  } else {
    bytes.set([73, 68, 51, 4]);
  }
  return bytes;
}

function audioResponse(
  headers: Record<string, string> = {},
  bytes = recognizedAudioBytes(headers['Content-Type'] ?? 'audio/wav'),
) {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'X-Pausa-Voice-Provider': 'heygen',
      'X-Pausa-Voice-Id': approvedIdentity.voiceId,
      'X-Pausa-Voice-Speed': '0.85',
      ...headers,
    },
  });
}

describe('Leonardo voice consent and provider contract', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_LEONARDO_TTS_ENDPOINT', endpoint);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('pins the approved course voice and its slower meditation delivery', () => {
    expect(LEONARDO_VOICE_ID).toBe(approvedIdentity.voiceId);
    expect(LEONARDO_DELIVERY_SPEED).toBe(0.85);
    vi.stubEnv('VITE_LEONARDO_TTS_ENDPOINT', `  ${endpoint}/  `);
    expect(getLeonardoTtsEndpoint()).toBe(endpoint);
  });

  it('does not contact a service when no endpoint has been configured', async () => {
    vi.stubEnv('VITE_LEONARDO_TTS_ENDPOINT', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Una pausa tranquila.', { consent: true }),
    ).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not disclose any text without consent for this session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Un detalle personal.', { consent: false }),
    ).rejects.toMatchObject({ code: 'consent_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'x'.repeat(801)])(
    'rejects an invalid text before contacting the provider',
    async (text) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        synthesizeLeonardoVoice(text, { consent: true }),
      ).rejects.toMatchObject({ code: 'invalid_text' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'http://voice.example.test',
    'https://account:secret@voice.example.test',
    'https://voice.example.test?token=example',
    'https://voice.example.test#other',
    'not a URL',
  ])('rejects an unsafe service destination without sending', async (url) => {
    vi.stubEnv('VITE_LEONARDO_TTS_ENDPOINT', url);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Una pausa tranquila.', { consent: true }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { generationVerified: false },
    { generationVerified: undefined },
    { provider: 'piper' },
    { voiceId: 'another-voice' },
    { deliverySpeed: 1 },
  ])(
    'does not send the guion when provider capabilities are unverified',
    async (change) => {
      const fetchMock = vi.fn().mockResolvedValue(capabilities(change));
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        synthesizeLeonardoVoice('Un detalle personal.', { consent: true }),
      ).rejects.toMatchObject({ code: 'provider_unverified' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `${endpoint}/v1/leonardo/capabilities`,
        expect.objectContaining({
          credentials: 'omit',
          redirect: 'error',
        }),
      );
      expect(fetchMock.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
    },
  );

  it.each(['audio/wav', 'audio/mpeg'])(
    'returns only verified audio and sends the minimal fixed synthesis payload (%s)',
    async (contentType) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(capabilities())
        .mockResolvedValueOnce(accessToken())
        .mockResolvedValueOnce(audioResponse({ 'Content-Type': contentType }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await synthesizeLeonardoVoice('  Respirá con calma.  ', {
        consent: true,
      });

      expect(result.voiceId).toBe(approvedIdentity.voiceId);
      expect(result.provider).toBe('heygen');
      expect(result.deliverySpeed).toBe(0.85);
      expect(result.audio.size).toBe(recognizedAudioBytes(contentType).length);
      expect(result.audio.type).toBe(contentType);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const [tokenUrl, tokenOptions] = fetchMock.mock.calls[1]!;
      expect(tokenUrl).toMatch(/\/api\/account\/voice-token$/);
      expect(tokenOptions).toEqual(
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
      const [url, options] = fetchMock.mock.calls[2]!;
      expect(url).toBe(`${endpoint}/v1/leonardo/tts`);
      expect(options).toEqual(
        expect.objectContaining({
          method: 'POST',
          credentials: 'omit',
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }),
      );
      expect(options.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(JSON.parse(options.body)).toEqual({
        text: 'Respirá con calma.',
        voiceId: approvedIdentity.voiceId,
        deliverySpeed: 0.85,
      });
      expect(options.signal).toBe(fetchMock.mock.calls[0]?.[1]?.signal);
    },
  );

  it.each<Record<string, string>>([
    { 'X-Pausa-Voice-Provider': 'piper' },
    { 'X-Pausa-Voice-Id': 'another-voice' },
    { 'X-Pausa-Voice-Speed': '1' },
    { 'X-Pausa-Voice-Id': '' },
  ])('rejects synthesized audio whose identity or speed differs', async (headers) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(accessToken())
      .mockResolvedValueOnce(audioResponse(headers));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Respirá con calma.', { consent: true }),
    ).rejects.toMatchObject({ code: 'identity_mismatch' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    { type: 'application/json', bytes: new Uint8Array([1]) },
    { type: 'audio/wav', bytes: new Uint8Array(0) },
    { type: 'audio/wav', bytes: new Uint8Array(4 * 1024 * 1024 + 1) },
  ])('rejects invalid or oversized provider audio', async ({ type, bytes }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(accessToken())
      .mockResolvedValueOnce(audioResponse({ 'Content-Type': type }, bytes));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Respirá con calma.', { consent: true }),
    ).rejects.toMatchObject({ code: 'invalid_audio' });
  });

  it('does not repeat a failed synthesis or silently use another provider', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(accessToken())
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Respirá con calma.', { consent: true }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks guests to sign in and never sends the script without an account token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(accessToken(401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Respirá con calma.', { consent: true }),
    ).rejects.toMatchObject({ code: 'auth_required' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Respirá');
  });

  it('does not synthesize when the account API cannot issue a voice token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(accessToken(503));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      synthesizeLeonardoVoice('Respirá con calma.', { consent: true }),
    ).rejects.toMatchObject({ code: 'provider_unverified' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancels an in-flight synthesis instead of accepting stale audio', async () => {
    const controller = new AbortController();
    let requestedSynthesis: (() => void) | undefined;
    const synthesisRequested = new Promise<void>((resolve) => {
      requestedSynthesis = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(accessToken())
      .mockImplementationOnce((_url: string, options: RequestInit) => {
        requestedSynthesis?.();
        return new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      });
    vi.stubGlobal('fetch', fetchMock);
    const result = synthesizeLeonardoVoice('Respirá con calma.', {
      consent: true,
      signal: controller.signal,
    });
    const rejection = expect(result).rejects.toMatchObject({ code: 'aborted' });
    await synthesisRequested;
    controller.abort();
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('bounds an unresponsive provider with one 45 second request window', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = synthesizeLeonardoVoice('Respirá con calma.', { consent: true });
    const rejection = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(44_999);
    expect(fetchMock.mock.calls[0]?.[1]?.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
  });
});
