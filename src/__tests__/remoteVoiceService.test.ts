import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertRemoteSessionTextLimits,
  assertRemoteTextLimits,
  getArgentineTtsEndpoint,
  isRemoteArgentineTtsConfigured,
  MAX_REMOTE_TTS_SEGMENT_CHARS,
  MAX_REMOTE_TTS_TOTAL_CHARS,
  RemoteVoiceError,
  synthesizeRemoteArgentineVoice,
} from '../lib/remoteVoiceService';

describe('remoteVoiceService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
      }),
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({ error: 'Texto demasiado largo', code: 'text_too_long' }),
      }),
    );
    await expect(synthesizeRemoteArgentineVoice('Hola')).rejects.toMatchObject({
      message: 'Texto demasiado largo',
      code: 'text_too_long',
    });
  });
});
