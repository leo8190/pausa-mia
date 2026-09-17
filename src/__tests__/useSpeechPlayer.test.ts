import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeechPlayer } from '../hooks/useSpeechPlayer';

const segments = [
  { text: 'Primera parte.', pauseAfterMs: 1000 },
  { text: 'Segunda parte.', pauseAfterMs: 1000 },
];

function fireEnd(utterance: SpeechSynthesisUtterance): void {
  utterance.onend?.call(utterance, {} as SpeechSynthesisEvent);
}

function fireError(utterance: SpeechSynthesisUtterance): void {
  utterance.onerror?.call(utterance, {
    error: 'synthesis-failed',
  } as SpeechSynthesisErrorEvent);
}

describe('useSpeechPlayer playback lifecycle', () => {
  let utterances: SpeechSynthesisUtterance[];

  beforeEach(() => {
    vi.useFakeTimers();
    utterances = [];
    vi.spyOn(window.speechSynthesis, 'getVoices').mockReturnValue([
      { name: 'Paulina', lang: 'es-MX' } as SpeechSynthesisVoice,
    ]);
    vi.spyOn(window.speechSynthesis, 'speak').mockImplementation((utterance) => {
      utterances.push(utterance);
    });
    vi.spyOn(window.speechSynthesis, 'cancel').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('invalidates the old utterance before synchronous cancellation callbacks', () => {
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    const oldUtterance = utterances[0];
    vi.spyOn(window.speechSynthesis, 'cancel').mockImplementation(() => {
      fireError(oldUtterance);
    });

    act(() => result.current.restart());

    expect(utterances.map((utterance) => utterance.text)).toEqual([
      'Primera parte.',
      'Primera parte.',
    ]);
    expect(result.current.playerState.currentSegmentIndex).toBe(0);
  });

  it('ignores old completion and error callbacks delivered after a new play', () => {
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    const oldUtterance = utterances[0];
    const oldEnd = oldUtterance.onend;
    const oldError = oldUtterance.onerror;
    act(() => result.current.play(segments));

    act(() => {
      oldError?.call(oldUtterance, {} as SpeechSynthesisErrorEvent);
      oldEnd?.call(oldUtterance, {} as SpeechSynthesisEvent);
      vi.advanceTimersByTime(5000);
    });

    expect(utterances).toHaveLength(2);
    expect(result.current.playerState).toEqual({
      status: 'playing',
      currentSegmentIndex: 0,
    });
  });

  it('stops at a failed segment instead of silently omitting it', () => {
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    act(() => fireError(utterances[0]));
    act(() => vi.advanceTimersByTime(5000));

    expect(utterances).toHaveLength(1);
    expect(result.current.playerState).toEqual({
      status: 'stopped',
      currentSegmentIndex: 0,
    });
    expect(result.current).toHaveProperty('playbackError', expect.any(String));

    act(() => result.current.play(segments));
    expect(result.current).toHaveProperty('playbackError', null);
    expect(utterances).toHaveLength(2);
  });

  it('waits for Continue when onend arrives after Pause', () => {
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    act(() => result.current.pause());
    act(() => fireEnd(utterances[0]));
    act(() => vi.advanceTimersByTime(5000));

    expect(utterances).toHaveLength(1);
    expect(result.current.playerState.status).toBe('paused');

    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(999));
    expect(utterances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(utterances[1].text).toBe('Segunda parte.');
  });

  it('preserves the remaining silence across repeated pause and resume', () => {
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    act(() => fireEnd(utterances[0]));
    act(() => vi.advanceTimersByTime(250));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(5000));
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(5000));
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(549));

    expect(utterances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(utterances[1].text).toBe('Segunda parte.');
  });

  it('stopping cancels the next segment and ignores late events', () => {
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    const utterance = utterances[0];
    const oldEnd = utterance.onend;
    act(() => fireEnd(utterance));
    act(() => result.current.stop());
    act(() => {
      oldEnd?.call(utterance, {} as SpeechSynthesisEvent);
      vi.advanceTimersByTime(5000);
    });

    expect(utterances).toHaveLength(1);
    expect(result.current.playerState.status).toBe('stopped');
  });

  it('resumes the browser itself when a paused utterance ended late', () => {
    const resume = vi.spyOn(window.speechSynthesis, 'resume');
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    act(() => result.current.pause());
    act(() => fireEnd(utterances[0]));
    resume.mockClear();
    act(() => result.current.resume());
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('clears the browser pause before restarting: cancel does not reset paused', () => {
    const resume = vi.spyOn(window.speechSynthesis, 'resume');
    const { result } = renderHook(() => useSpeechPlayer('es-neutro'));
    act(() => result.current.play(segments));
    act(() => result.current.pause());
    Object.defineProperty(window.speechSynthesis, 'paused', {
      configurable: true,
      value: true,
    });
    try {
      resume.mockClear();
      act(() => result.current.restart());
      expect(resume).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window.speechSynthesis, 'paused', {
        configurable: true,
        value: false,
      });
    }
  });
});
