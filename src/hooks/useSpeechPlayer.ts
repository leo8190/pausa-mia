import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScriptSegment } from '../types';
import {
  createUtterance,
  getAvailableVoices,
  selectVoice,
  type SpeechPlayerState,
} from '../lib/voiceService';
import type { VoiceVariant } from '../types';
import { registerSpeechCancel } from '../lib/speechController';

export function useSpeechPlayer(voiceVariant: VoiceVariant) {
  const [playerState, setPlayerState] = useState<SpeechPlayerState>({
    status: 'idle',
    currentSegmentIndex: 0,
  });
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [voicesReady, setVoicesReady] = useState(false);
  const segmentsRef = useRef<ScriptSegment[]>([]);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const indexRef = useRef(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const betweenSegmentsRef = useRef(false);
  const remainingPauseMsRef = useRef(0);
  const pauseStartTimeRef = useRef(0);
  const pendingNextIndexRef = useRef(0);

  const clearPauseTimer = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  };

  const loadVoices = useCallback(() => {
    const voices = getAvailableVoices();
    const selection = selectVoice(voiceVariant, voices);
    voiceRef.current = selection.voice;
    setFallbackMessage(selection.fallbackMessage);
    setVoicesReady(voices.length > 0);
  }, [voiceVariant]);

  useEffect(() => {
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, [loadVoices]);

  const speakSegment = useCallback((index: number) => {
    if (stoppedRef.current) return;
    const segments = segmentsRef.current;
    if (index >= segments.length) {
      betweenSegmentsRef.current = false;
      setPlayerState({ status: 'stopped', currentSegmentIndex: segments.length });
      return;
    }

    const segment = segments[index];
    indexRef.current = index;
    betweenSegmentsRef.current = false;
    setPlayerState({ status: 'playing', currentSegmentIndex: index });

    const utterance = createUtterance(segment.text, voiceRef.current);
    utterance.onend = () => {
      if (stoppedRef.current) return;
      betweenSegmentsRef.current = true;
      pendingNextIndexRef.current = index + 1;
      pauseStartTimeRef.current = Date.now();
      pauseTimerRef.current = setTimeout(() => {
        betweenSegmentsRef.current = false;
        speakSegment(index + 1);
      }, segment.pauseAfterMs);
    };
    utterance.onerror = () => {
      if (!stoppedRef.current) {
        speakSegment(index + 1);
      }
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const play = useCallback(
    (segments: ScriptSegment[]) => {
      stoppedRef.current = false;
      segmentsRef.current = segments;
      loadVoices();
      window.speechSynthesis.cancel();
      clearPauseTimer();
      betweenSegmentsRef.current = false;
      indexRef.current = 0;
      speakSegment(0);
    },
    [loadVoices, speakSegment],
  );

  const pause = useCallback(() => {
    if (betweenSegmentsRef.current) {
      clearPauseTimer();
      remainingPauseMsRef.current = Math.max(
        0,
        (segmentsRef.current[indexRef.current]?.pauseAfterMs ?? 0) -
          (Date.now() - pauseStartTimeRef.current),
      );
    } else {
      window.speechSynthesis.pause();
    }
    setPlayerState((prev) => ({ ...prev, status: 'paused' }));
  }, []);

  const resume = useCallback(() => {
    if (betweenSegmentsRef.current) {
      pauseTimerRef.current = setTimeout(() => {
        betweenSegmentsRef.current = false;
        speakSegment(pendingNextIndexRef.current);
      }, remainingPauseMsRef.current);
    } else {
      window.speechSynthesis.resume();
    }
    setPlayerState((prev) => ({ ...prev, status: 'playing' }));
  }, [speakSegment]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    betweenSegmentsRef.current = false;
    window.speechSynthesis.cancel();
    clearPauseTimer();
    setPlayerState({ status: 'stopped', currentSegmentIndex: indexRef.current });
  }, []);

  const restart = useCallback(() => {
    stoppedRef.current = false;
    betweenSegmentsRef.current = false;
    window.speechSynthesis.cancel();
    clearPauseTimer();
    speakSegment(0);
  }, [speakSegment]);

  useEffect(() => {
    const unregister = registerSpeechCancel(stop);
    return () => {
      unregister();
      stoppedRef.current = true;
      window.speechSynthesis.cancel();
      clearPauseTimer();
    };
  }, [stop]);

  return {
    playerState,
    fallbackMessage,
    voicesReady,
    play,
    pause,
    resume,
    stop,
    restart,
  };
}
