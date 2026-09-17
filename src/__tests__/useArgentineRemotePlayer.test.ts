import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  argentineWavDownloadName,
  isAutoplayPolicyError,
  REMOTE_WARMUP_TEXT,
  useArgentineVoicePlayer,
  type ArgentineVoiceMode,
} from '../hooks/useArgentineVoicePlayer';
import * as voiceEngine from '../lib/voiceEngine';
import * as remoteVoice from '../lib/remoteVoiceService';
import { REMOTE_ARGENTINE_PLAYBACK_RATE } from '../lib/voiceCadence';

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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores synthesis from before a restart even when local inference cannot abort', async () => {
    let resolveOld!: (blob: Blob) => void;
    const oldBlob = new Blob(['old']);
    const newBlob = new Blob(['new']);
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue(newBlob);
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    act(() => result.current.play([{ text: 'Primera.', pauseAfterMs: 0 }]));
    await act(async () => result.current.restart());
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    await act(async () => resolveOld(oldBlob));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(newBlob);
  });

  it('keeps a phrase paused if its audio arrives after the pause button', async () => {
    let resolveAudio!: (blob: Blob) => void;
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAudio = resolve;
        }),
    );
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    act(() => result.current.play([{ text: 'Primera.', pauseAfterMs: 0 }]));
    act(() => result.current.pause());
    await act(async () => resolveAudio(new Blob(['audio'])));
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('paused');
    await act(async () => result.current.resume());
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe('playing');
  });

  it('does not revive stopped playback when an old play promise resolves', async () => {
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockResolvedValue(
      new Blob(['audio']),
    );
    let finishPlay!: () => void;
    window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPlay = resolve;
        }),
    );
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => result.current.play([{ text: 'Primera.', pauseAfterMs: 0 }]));
    act(() => result.current.stop());
    await act(async () => finishPlay());
    expect(result.current.state.status).toBe('stopped');
    expect(result.current.state.nativeAudioUrl).toBeNull();
  });

  it('does not skip ahead on a late ended callback from before a restart', async () => {
    vi.useFakeTimers();
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(new Blob(['audio']));
    const play = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () =>
      result.current.play([
        { text: 'Primera.', pauseAfterMs: 100 },
        { text: 'Segunda.', pauseAfterMs: 100 },
      ]),
    );
    const audio = play.mock.contexts.at(-1) as HTMLAudioElement;
    const lateEnd = audio.onended!;
    await act(async () => result.current.restart());
    act(() => {
      lateEnd.call(audio, new Event('ended'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(synthesis).toHaveBeenCalledTimes(2);
    expect(result.current.state.currentSegmentIndex).toBe(0);
  });

  it('does not advance if ended arrives while paused, and preserves repeated pauses', async () => {
    vi.useFakeTimers();
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(new Blob(['audio']));
    const play = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () =>
      result.current.play([
        { text: 'Primera.', pauseAfterMs: 1000 },
        { text: 'Segunda.', pauseAfterMs: 1000 },
      ]),
    );
    const audio = play.mock.contexts.at(-1) as HTMLAudioElement;
    act(() => result.current.pause());
    act(() => audio.dispatchEvent(new Event('ended')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(synthesis).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe('paused');
    act(() => result.current.resume());
    // Argentine pauses are 1120 ms, with 720 ms left after two 200 ms runs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    act(() => result.current.pause());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    act(() => result.current.resume());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    act(() => result.current.pause());
    act(() => result.current.resume());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(719);
    });
    expect(synthesis).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(synthesis).toHaveBeenCalledTimes(2);
    expect(result.current.state.currentSegmentIndex).toBe(1);
  });

  it('reuses the same HTMLAudioElement across segments (no remount per phrase)', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'assertRemoteSessionTextLimits').mockImplementation(() => {});
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    );
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:seg-0')
      .mockReturnValueOnce('blob:seg-1');

    const AudioSpy = vi.spyOn(window, 'Audio');
    const playSpy = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      result.current.play([
        { text: 'Primera frase.', pauseAfterMs: 0 },
        { text: 'Segunda frase.', pauseAfterMs: 0 },
      ]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
      expect(result.current.state.currentSegmentIndex).toBe(0);
    });

    expect(AudioSpy).toHaveBeenCalledTimes(1);
    const firstAudio = playSpy.mock.contexts.at(-1) as HTMLAudioElement;
    expect(firstAudio).toBeDefined();

    await act(async () => {
      firstAudio.dispatchEvent(new Event('ended'));
    });

    await waitFor(() => {
      expect(result.current.state.currentSegmentIndex).toBe(1);
      expect(result.current.state.status).toBe('playing');
    });

    expect(AudioSpy).toHaveBeenCalledTimes(1);
    const secondAudio = playSpy.mock.contexts.at(-1) as HTMLAudioElement;
    expect(secondAudio).toBe(firstAudio);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:seg-0');
  });

  it('applies serene client playbackRate on remote WAV blobs without remounting Audio', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'assertRemoteSessionTextLimits').mockImplementation(() => {});
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    );
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:rate-0')
      .mockReturnValueOnce('blob:rate-1');

    const AudioSpy = vi.spyOn(window, 'Audio');
    const playSpy = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      result.current.play([
        { text: 'Primera frase.', pauseAfterMs: 0 },
        { text: 'Segunda frase.', pauseAfterMs: 0 },
      ]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
    });

    const firstAudio = playSpy.mock.contexts.at(-1) as HTMLAudioElement;
    expect(firstAudio.playbackRate).toBeCloseTo(REMOTE_ARGENTINE_PLAYBACK_RATE, 5);
    expect(firstAudio.defaultPlaybackRate).toBeCloseTo(
      REMOTE_ARGENTINE_PLAYBACK_RATE,
      5,
    );
    expect(REMOTE_ARGENTINE_PLAYBACK_RATE).toBe(1);
    expect(AudioSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstAudio.dispatchEvent(new Event('ended'));
    });

    await waitFor(() => {
      expect(result.current.state.currentSegmentIndex).toBe(1);
      expect(result.current.state.status).toBe('playing');
    });

    const secondAudio = playSpy.mock.contexts.at(-1) as HTMLAudioElement;
    expect(secondAudio).toBe(firstAudio);
    expect(secondAudio.playbackRate).toBeCloseTo(REMOTE_ARGENTINE_PLAYBACK_RATE, 5);
    expect(secondAudio.defaultPlaybackRate).toBeCloseTo(
      REMOTE_ARGENTINE_PLAYBACK_RATE,
      5,
    );
    expect(AudioSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps nativeControlsRequired latched across segments after autoplay block', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'assertRemoteSessionTextLimits').mockImplementation(() => {});
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    );
    window.HTMLMediaElement.prototype.play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      result.current.play([
        { text: 'Primera.', pauseAfterMs: 0 },
        { text: 'Segunda.', pauseAfterMs: 0 },
      ]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('needs-native-play');
      expect(result.current.state.nativeControlsRequired).toBe(true);
    });

    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      result.current.resume();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
    });
    expect(result.current.state.nativeControlsRequired).toBe(true);

    const audio = (
      window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>
    ).mock.contexts.at(-1) as HTMLAudioElement;

    await act(async () => {
      audio.dispatchEvent(new Event('ended'));
    });

    await waitFor(() => {
      expect(result.current.state.currentSegmentIndex).toBe(1);
    });
    expect(result.current.state.nativeControlsRequired).toBe(true);
  });

  it('prepare remoto exige endpoint y no llama Piper local', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(false);
    const localSpy = vi.spyOn(voiceEngine, 'synthesizeArgentineVoice');
    const remoteSpy = vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice');

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));
    let ok = true;
    await act(async () => {
      ok = await result.current.prepare();
    });
    expect(ok).toBe(false);
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toMatch(/endpoint remoto/i);
    expect(localSpy).not.toHaveBeenCalled();
    expect(remoteSpy).not.toHaveBeenCalled();
  });

  it('prepare remoto hace warm-up con frase fija y no usa texto del guion', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
    );
    const localSpy = vi.spyOn(voiceEngine, 'synthesizeArgentineVoice');

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));
    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.state.status).toBe('ready');
    expect(remoteVoice.synthesizeRemoteArgentineVoice).toHaveBeenCalledWith(
      REMOTE_WARMUP_TEXT,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(remoteVoice.synthesizeRemoteArgentineVoice).not.toHaveBeenCalledWith(
      expect.stringMatching(/Respirá\./i),
      expect.anything(),
    );
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
    expect(remoteVoice.synthesizeRemoteArgentineVoice).toHaveBeenNthCalledWith(
      1,
      REMOTE_WARMUP_TEXT,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(remoteVoice.synthesizeRemoteArgentineVoice).toHaveBeenNthCalledWith(
      2,
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
    expect(playedAudio?.playbackRate).toBeCloseTo(REMOTE_ARGENTINE_PLAYBACK_RATE, 5);
    expect(playedAudio?.defaultPlaybackRate).toBeCloseTo(
      REMOTE_ARGENTINE_PLAYBACK_RATE,
      5,
    );

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

  it('aborts remote warm-up when switching back to local mode', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockImplementation(
      async (_text, options) => {
        capturedSignal = options?.signal;
        return await new Promise<Blob>((resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
          // Pendiente hasta abort para simular warm-up en curso.
          setTimeout(
            () => resolve(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })),
            5_000,
          );
        });
      },
    );

    const { result, rerender } = renderHook(
      ({ mode }: { mode: ArgentineVoiceMode }) => useArgentineVoicePlayer(mode),
      { initialProps: { mode: 'remote' as ArgentineVoiceMode } },
    );
    act(() => {
      void result.current.prepare();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('preparing');
    });

    rerender({ mode: 'local' });
    await waitFor(() => {
      expect(result.current.state.mode).toBe('local');
      expect(result.current.state.status).toBe('idle');
    });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('keeps remote in error when warm-up fails', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockRejectedValue(
      new remoteVoice.RemoteVoiceError('Servicio remoto caído', 'network_error'),
    );

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));
    let ok = true;
    await act(async () => {
      ok = await result.current.prepare();
    });

    expect(ok).toBe(false);
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toMatch(/Servicio remoto caído/i);
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

  it('keeps local Piper playbackRate at 1 (serene scale is in synthesis)', async () => {
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/wav' }),
    );
    const playSpy = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() => useArgentineVoicePlayer('local'));

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      result.current.play([{ text: 'Respirá local.', pauseAfterMs: 0 }]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
    });

    const audio = playSpy.mock.contexts.at(-1) as HTMLAudioElement;
    expect(audio.playbackRate).toBe(1);
    expect(audio.defaultPlaybackRate).toBe(1);
  });
});
