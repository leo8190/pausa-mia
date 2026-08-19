import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertRemoteSessionTextLimits,
  assertRemoteTextLimits,
  createRemoteTtsAbortSignal,
  getArgentineTtsEndpoint,
  isRemoteArgentineTtsConfigured,
  MAX_REMOTE_TTS_SEGMENT_CHARS,
  MAX_REMOTE_TTS_TOTAL_CHARS,
  REMOTE_TTS_TIMEOUT_MS,
  REMOTE_TTS_RETRY_DELAY_MS,
  RemoteVoiceError,
  synthesizeRemoteArgentineVoice,
} from '../lib/remoteVoiceService';

describe('remoteVoiceService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('treats empty endpoint as unconfigured and never sends', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', '');
    expect(getArgentineTtsEndpoint()).toBe('');
    expect(isRemoteArgentineTtsConfigured()).toBe(false);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(synthesizeRemoteArgentineVoice('Hola')).rejects.toMatchObject({
      code: 'endpoint_missing',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trims trailing slashes from the configured endpoint', () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com/');
    expect(getArgentineTtsEndpoint()).toBe('https://tts.example.com');
  });

  it('rejects oversized segment and session text before fetch', () => {
    expect(() => assertRemoteTextLimits('')).toThrow(RemoteVoiceError);
    expect(() =>
      assertRemoteTextLimits('x'.repeat(MAX_REMOTE_TTS_SEGMENT_CHARS + 1)),
    ).toThrow(/límite/);
    expect(() =>
      assertRemoteSessionTextLimits('y'.repeat(MAX_REMOTE_TTS_TOTAL_CHARS + 1)),
    ).toThrow(/límite remoto/);
  });

  it('POSTs JSON {text} and returns an audio/wav Blob', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    const wavBytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'audio/wav' : null,
      },
      blob: async () => new Blob([wavBytes], { type: 'audio/wav' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const blob = await synthesizeRemoteArgentineVoice('  Respirá despacio.  ');
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(wavBytes.length);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tts.example.com/v1/tts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'Respirá despacio.' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('retries once after a transient 503 and keeps the same text', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    vi.useFakeTimers();
    const wav = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Servicio iniciándose', code: 'warming_up' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'audio/wav' },
        blob: async () => wav,
      });
    vi.stubGlobal('fetch', fetchMock);

    const promise = synthesizeRemoteArgentineVoice('Respirá despacio.');
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(REMOTE_TTS_RETRY_DELAY_MS);
    const result = await promise;

    expect(result.type).toBe('audio/wav');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ text: 'Respirá despacio.' }),
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ text: 'Respirá despacio.' }),
    );
  });

  it('surfaces abort and JSON errors clearly', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');

    const abortController = new AbortController();
    abortController.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
    );
    await expect(
      synthesizeRemoteArgentineVoice('Hola', { signal: abortController.signal }),
    ).rejects.toMatchObject({ code: 'aborted' });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({ error: 'Texto demasiado largo', code: 'text_too_long' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(synthesizeRemoteArgentineVoice('Hola')).rejects.toMatchObject({
      message: 'Texto demasiado largo',
      code: 'text_too_long',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels the retry wait when the external signal aborts', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    vi.useFakeTimers();
    const external = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Gateway temporal', code: 'bad_gateway' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = synthesizeRemoteArgentineVoice('Hola', { signal: external.signal });
    await Promise.resolve();
    await Promise.resolve();
    external.abort();

    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts fetch on timeout and reports a clear timeout error', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    vi.useFakeTimers();

    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(
      synthesizeRemoteArgentineVoice('Hola', { timeoutMs: 100 }),
    ).rejects.toMatchObject({
      code: 'timeout',
      message: expect.stringMatching(/tiempo de espera/i),
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('preserves an external AbortSignal and still cleans up the timeout', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    vi.useFakeTimers();

    const external = new AbortController();
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(
      synthesizeRemoteArgentineVoice('Hola', {
        signal: external.signal,
        timeoutMs: REMOTE_TTS_TIMEOUT_MS,
      }),
    ).rejects.toMatchObject({ code: 'aborted' });

    external.abort();
    await assertion;
    expect(capturedSignal?.aborted).toBe(true);

    // El timer interno no debe disparar un segundo abort tras cleanup.
    const { signal, didTimeout, cleanup } = createRemoteTtsAbortSignal(undefined, 50);
    cleanup();
    await vi.advanceTimersByTimeAsync(50);
    expect(didTimeout()).toBe(false);
    expect(signal.aborted).toBe(false);
  });

  it('reports offline with a clear message when navigator is offline', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(synthesizeRemoteArgentineVoice('Hola')).rejects.toMatchObject({
      code: 'offline',
      message: expect.stringMatching(/sin conexión/i),
    });
  });

  it('reports CORS/network failure clearly when online', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(synthesizeRemoteArgentineVoice('Hola')).rejects.toMatchObject({
      code: 'cors',
      message: expect.stringMatching(/cors/i),
    });
  });
});
