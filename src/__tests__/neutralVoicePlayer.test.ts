import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArgentineVoicePlayer } from '../hooks/useArgentineVoicePlayer';
import type { VoiceVariant } from '../types';
import * as engine from '../lib/voiceEngine';
import * as remote from '../lib/remoteVoiceService';

describe('neutral WAV player', () => {
  beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn().mockReturnValue('blob:neutral');
        static revokeObjectURL = vi.fn();
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reuses the neutral opening once at natural audio speed, without system speech', async () => {
    const neutral = vi
      .spyOn(engine, 'synthesizeNeutralVoice')
      .mockResolvedValue(new Blob(['neutral']));
    const argentine = vi.spyOn(engine, 'synthesizeArgentineVoice');
    const speak = vi.spyOn(window.speechSynthesis, 'speak');
    const { result } = renderHook(() => useArgentineVoicePlayer('local', 'es-neutro'));
    await act(async () => {
      await result.current.prepare('Tu ritmo.');
    });
    expect(result.current.state.status).toBe('ready');
    await act(async () =>
      result.current.play([{ text: 'Tu ritmo.', pauseAfterMs: 0 }]),
    );
    expect(neutral).toHaveBeenCalledTimes(1);
    expect(argentine).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    const play = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    const audio = play.mock.contexts[0] as HTMLAudioElement;
    expect(audio.playbackRate).toBe(1);
    expect(audio.getAttribute('playsinline')).toBe('true');
  });

  it('cannot send neutral text to the Argentine remote endpoint even if remote is requested', async () => {
    vi.spyOn(engine, 'synthesizeNeutralVoice').mockResolvedValue(new Blob(['neutral']));
    const remoteSynthesis = vi.spyOn(remote, 'synthesizeRemoteArgentineVoice');
    const { result } = renderHook(() => useArgentineVoicePlayer('remote', 'es-neutro'));
    await act(async () => {
      await result.current.prepare('Texto sintético.');
    });
    await act(async () =>
      result.current.play([{ text: 'Texto sintético.', pauseAfterMs: 0 }]),
    );
    expect(result.current.state.mode).toBe('local');
    expect(remoteSynthesis).not.toHaveBeenCalled();
  });

  it('aborts and discards a late opening when the selected voice changes', async () => {
    let finish!: (blob: Blob) => void;
    const neutral = vi.spyOn(engine, 'synthesizeNeutralVoice').mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    const argentineBlob = new Blob(['argentine']);
    const argentine = vi
      .spyOn(engine, 'synthesizeArgentineVoice')
      .mockResolvedValue(argentineBlob);
    const { result, rerender } = renderHook(
      ({ variant }: { variant: VoiceVariant }) =>
        useArgentineVoicePlayer('local', variant),
      { initialProps: { variant: 'es-neutro' as VoiceVariant } },
    );
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.prepare('Tu ritmo.');
    });
    const signal = neutral.mock.calls[0][2];
    rerender({ variant: 'es-AR' });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish(new Blob(['old-neutral']));
      expect(await pending).toBe(false);
    });
    expect(result.current.state.status).toBe('idle');
    await act(async () =>
      result.current.play([{ text: 'Tu ritmo.', pauseAfterMs: 0 }]),
    );
    expect(argentine).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect((URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      argentineBlob,
    );
  });

  it('keeps neutral audio available with native iPhone controls after an autoplay refusal', async () => {
    vi.spyOn(engine, 'synthesizeNeutralVoice').mockResolvedValue(new Blob(['neutral']));
    window.HTMLMediaElement.prototype.play = vi
      .fn()
      .mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const { result } = renderHook(() => useArgentineVoicePlayer('local', 'es-neutro'));
    await act(async () =>
      result.current.play([{ text: 'Tu ritmo.', pauseAfterMs: 0 }]),
    );
    expect(result.current.state.status).toBe('needs-native-play');
    expect(result.current.state.nativeAudioUrl).toBe('blob:neutral');
    const host = document.createElement('div');
    act(() => result.current.mountNativeAudioElement(host));
    expect(host.querySelector('audio')).toHaveAttribute(
      'controlslist',
      'nodownload noplaybackrate',
    );
    act(() => result.current.stop());
    expect(host.querySelector('audio')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:neutral');
  });
});
