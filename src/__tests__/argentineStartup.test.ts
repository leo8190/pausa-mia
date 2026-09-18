import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  REMOTE_WARMUP_TEXT,
  useArgentineVoicePlayer,
  type ArgentineVoiceMode,
} from '../hooks/useArgentineVoicePlayer';
import * as voiceEngine from '../lib/voiceEngine';
import * as remoteVoice from '../lib/remoteVoiceService';
import { cancelActiveSpeech } from '../lib/speechController';

const first = { text: 'Tomate este momento para descansar.', pauseAfterMs: 0 };

describe('inicio argentino sin síntesis descartada', () => {
  beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn().mockReturnValue('blob:prepared'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('prepares the real opening once and plays that same blob without another inference', async () => {
    const blob = new Blob(['opening']);
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(blob);
    const remote = vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice');
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => {
      await result.current.prepare(first.text);
    });
    expect(synthesis.mock.calls[0][0]).toBe(first.text);
    expect(result.current.state.status).toBe('ready');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(1);
    expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).toBe(blob);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(remote).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('discards prepared audio if the opening text has changed', async () => {
    const original = new Blob(['original']);
    const changed = new Blob(['changed']);
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValueOnce(original)
      .mockResolvedValue(changed);
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => {
      await result.current.prepare(first.text);
    });
    await act(async () => result.current.play([{ ...first, text: 'Otro comienzo.' }]));
    expect(synthesis).toHaveBeenCalledTimes(2);
    expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).toBe(changed);
    expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).not.toBe(original);
  });

  it('clears private prepared audio on stop even before it was played', async () => {
    const blob = new Blob(['audio']);
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(blob);
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => {
      await result.current.prepare(first.text);
    });
    act(() => result.current.stop());
    await act(async () => result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(2);
  });

  it('does not reuse preparation across mode changes, even after switching back', async () => {
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(new Blob(['audio']));
    const { result, rerender } = renderHook(
      ({ mode }: { mode: ArgentineVoiceMode }) => useArgentineVoicePlayer(mode),
      { initialProps: { mode: 'local' as ArgentineVoiceMode } },
    );
    await act(async () => {
      await result.current.prepare(first.text);
    });
    rerender({ mode: 'remote' });
    rerender({ mode: 'local' });
    await act(async () => result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(2);
  });

  it('cannot restore stopped preparation when uncancellable inference finishes late', async () => {
    let finish!: (blob: Blob) => void;
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(new Blob(['new']));
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.prepare(first.text);
    });
    act(() => result.current.stop());
    await act(async () => {
      finish(new Blob(['stale']));
      await pending;
    });
    expect(result.current.state.status).toBe('stopped');
    await act(async () => result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(2);
  });

  it('keeps the newest preparation when an older inference finishes afterwards', async () => {
    let finishOld!: (blob: Blob) => void;
    const latest = new Blob(['latest']);
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue(latest);
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    let old!: Promise<boolean>;
    act(() => {
      old = result.current.prepare('Anterior.');
    });
    await act(async () => {
      await result.current.prepare(first.text);
    });
    await act(async () => {
      finishOld(new Blob(['old']));
      await old;
    });
    await act(async () => result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(2);
    expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).toBe(latest);
  });

  it('consumes preparation once instead of retaining a private audio cache for restarts', async () => {
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(new Blob(['audio']));
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => {
      await result.current.prepare(first.text);
    });
    await act(async () => result.current.play([first]));
    await act(async () => result.current.restart());
    expect(synthesis).toHaveBeenCalledTimes(2);
  });

  it('never sends the proposed opening in a remote warm-up', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    const remote = vi
      .spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice')
      .mockResolvedValue(new Blob(['remote']));
    const local = vi.spyOn(voiceEngine, 'synthesizeArgentineVoice');
    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));
    await act(async () => {
      await result.current.prepare('Detalle privado.');
    });
    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote.mock.calls[0][0]).toBe(REMOTE_WARMUP_TEXT);
    expect(local).not.toHaveBeenCalled();
  });

  it('session deletion clears an opening that has not been played yet', async () => {
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(new Blob(['audio']));
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => {
      await result.current.prepare(first.text);
    });
    act(() => cancelActiveSpeech());
    expect(result.current.state.status).toBe('stopped');
    await act(async () => result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(2);
  });

  it('does not reuse private preparation in a new mounted player', async () => {
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(new Blob(['audio']));
    const old = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => {
      await old.result.current.prepare(first.text);
    });
    old.unmount();
    const current = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => current.result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(2);
  });

  it('a failed new preparation cannot leave the previous opening reusable', async () => {
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValueOnce(new Blob(['old']))
      .mockRejectedValueOnce(new Error('Preparation failed'))
      .mockResolvedValue(new Blob(['new']));
    const { result } = renderHook(() => useArgentineVoicePlayer('local'));
    await act(async () => {
      await result.current.prepare(first.text);
    });
    await act(async () => {
      expect(await result.current.prepare('Nuevo.')).toBe(false);
    });
    await act(async () => result.current.play([first]));
    expect(synthesis).toHaveBeenCalledTimes(3);
  });
});
