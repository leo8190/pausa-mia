import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  argentineWavDownloadName,
  isAutoplayPolicyError,
  useArgentineVoicePlayer,
  type ArgentineVoiceMode,
} from '../hooks/useArgentineVoicePlayer';
import * as voiceEngine from '../lib/voiceEngine';
import * as remoteVoice from '../lib/remoteVoiceService';

describe('isAutoplayPolicyError', () => {
  it('detects NotAllowedError from DOMException and similar messages', () => {
    expect(isAutoplayPolicyError(new DOMException('Denied', 'NotAllowedError'))).toBe(
      true,
    );
    expect(isAutoplayPolicyError(new Error('play() failed because of autoplay'))).toBe(
      true,
    );
    expect(isAutoplayPolicyError(new Error('network failed'))).toBe(false);
  });
});

describe('argentineWavDownloadName', () => {
  it('uses a neutral filename without script content', () => {
    expect(argentineWavDownloadName(0)).toBe('pausa-mia-segmento-1.wav');
    expect(argentineWavDownloadName(4)).toBe('pausa-mia-segmento-5.wav');
    expect(argentineWavDownloadName(Number.NaN)).toBe('pausa-mia-segmento-1.wav');
  });
});

describe('useArgentineVoicePlayer — remoto', () => {
  beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    if (!('createObjectURL' in URL)) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(),
        configurable: true,
      });
    }
    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        configurable: true,
      });
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:remote-mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prepare remoto exige endpoint y no llama Piper local', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(false);
    const localSpy = vi.spyOn(voiceEngine, 'synthesizeArgentineVoice');

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));
    let ok = true;
    await act(async () => {
      ok = await result.current.prepare();
    });
    expect(ok).toBe(false);
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toMatch(/endpoint remoto/i);
    expect(localSpy).not.toHaveBeenCalled();
  });

  it('reproduce un segmento remoto con HTMLAudioElement y limpia object URLs al detener', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'assertRemoteSessionTextLimits').mockImplementation(() => {});
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    );

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));

    await act(async () => {
      await result.current.prepare();
    });
    expect(result.current.state.status).toBe('ready');

    await act(async () => {
      result.current.play([{ text: 'Respirá.', pauseAfterMs: 5 }]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
    });
    expect(remoteVoice.synthesizeRemoteArgentineVoice).toHaveBeenCalledWith(
      'Respirá.',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    const playSpy = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    const playedAudio = playSpy.mock.contexts.at(-1) as HTMLAudioElement | undefined;
    expect(playedAudio).toBeDefined();
    expect(playedAudio?.preload).toBe('auto');
    expect(playedAudio?.getAttribute('playsinline')).toBe('true');
    expect(playedAudio?.getAttribute('webkit-playsinline')).toBe('true');

    act(() => {
      result.current.stop();
    });
    expect(result.current.state.status).toBe('stopped');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:remote-mock');
  });

  it('falls back to native controls when audio.play is blocked by autoplay policy', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'assertRemoteSessionTextLimits').mockImplementation(() => {});
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    );
    window.HTMLMediaElement.prototype.play = vi
      .fn()
      .mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      result.current.play([{ text: 'Respirá.', pauseAfterMs: 5 }]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('needs-native-play');
    });
    expect(result.current.state.nativeAudioUrl).toBe('blob:remote-mock');
    expect(result.current.state.nativeControlsRequired).toBe(true);
    expect(result.current.state.error).toBeNull();

    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      result.current.resume();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
    });
    expect(result.current.state.nativeControlsRequired).toBe(true);
  });

  it('changing from local to remote ignores a late local prepare', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    let resolveLocal: ((blob: Blob) => void) | undefined;
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLocal = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ mode }: { mode: ArgentineVoiceMode }) => useArgentineVoicePlayer(mode),
      { initialProps: { mode: 'local' as ArgentineVoiceMode } },
    );

    act(() => {
      void result.current.prepare();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('preparing');
    });

    rerender({ mode: 'remote' });
    await waitFor(() => {
      expect(result.current.state.mode).toBe('remote');
      expect(result.current.state.status).toBe('idle');
    });

    await act(async () => {
      resolveLocal?.(new Blob([new Uint8Array([1])], { type: 'audio/x-wav' }));
    });

    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.mode).toBe('remote');
  });
});
