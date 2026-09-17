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
import { checkWebSpeechEngineSupport } from '../lib/voiceEngine';
import { scalePausesForArgentineDelivery } from '../lib/voiceCadence';

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  return window.speechSynthesis;
}

export function useSpeechPlayer(voiceVariant: VoiceVariant) {
  const speechSupported = checkWebSpeechEngineSupport();
  const [playerState, setPlayerState] = useState<SpeechPlayerState>({
    status: 'idle',
    currentSegmentIndex: 0,
  });
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [voicesReady, setVoicesReady] = useState(false);
  const segmentsRef = useRef<ScriptSegment[]>([]);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const indexRef = useRef(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(true);
  const pausedRef = useRef(false);
  const sessionIdRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const betweenSegmentsRef = useRef(false);
  const remainingPauseMsRef = useRef(0);
  const pauseStartTimeRef = useRef(0);
  const pendingNextIndexRef = useRef(0);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const invalidatePlayback = useCallback(() => {
    // cancel() puede entregar eventos ahora o después de iniciar otra sesión.
    // Invalidar primero evita que esos eventos hablen o salteen otra frase.
    sessionIdRef.current += 1;
    stoppedRef.current = true;
    pausedRef.current = false;
    betweenSegmentsRef.current = false;
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
    }
    clearPauseTimer();
    getSpeechSynthesis()?.cancel();
  }, [clearPauseTimer]);

  const loadVoices = useCallback(() => {
    if (!checkWebSpeechEngineSupport()) {
      voiceRef.current = null;
      setFallbackMessage(
        'Este navegador no ofrece síntesis de voz. Podés leer el guion en pantalla.',
      );
      setVoicesReady(false);
      return;
    }
    const voices = getAvailableVoices();
    const selection = selectVoice(voiceVariant, voices);
    voiceRef.current = selection.voice;
    setFallbackMessage(selection.fallbackMessage);
    setVoicesReady(selection.voice !== null);
  }, [voiceVariant]);

  useEffect(() => {
    loadVoices();
    const synthesis = getSpeechSynthesis();
    if (synthesis) {
      synthesis.onvoiceschanged = loadVoices;
      return () => {
        synthesis.onvoiceschanged = null;
      };
    }
  }, [loadVoices]);

  const speakSegment = useCallback(
    (index: number) => {
      if (stoppedRef.current || pausedRef.current) return;
      const synthesis = getSpeechSynthesis();
      if (!synthesis || !voiceRef.current) return;
      const segments = segmentsRef.current;
      if (index >= segments.length) {
        stoppedRef.current = true;
        betweenSegmentsRef.current = false;
        setPlayerState({ status: 'stopped', currentSegmentIndex: segments.length });
        return;
      }

      const segment = segments[index];
      indexRef.current = index;
      betweenSegmentsRef.current = false;
      setPlayerState({ status: 'playing', currentSegmentIndex: index });

      const utterance = createUtterance(segment.text, voiceRef.current, {
        voiceVariant,
      });
      const sessionId = sessionIdRef.current;
      utteranceRef.current = utterance;
      const isCurrent = () =>
        !stoppedRef.current &&
        sessionId === sessionIdRef.current &&
        utteranceRef.current === utterance;
      utterance.onend = () => {
        if (!isCurrent()) return;
        utteranceRef.current = null;
        betweenSegmentsRef.current = true;
        pendingNextIndexRef.current = index + 1;
        remainingPauseMsRef.current = segment.pauseAfterMs;
        // El final puede llegar cuando pause() ya se pidió al navegador.
        if (pausedRef.current) return;
        pauseStartTimeRef.current = Date.now();
        pauseTimerRef.current = setTimeout(() => {
          if (
            sessionId !== sessionIdRef.current ||
            stoppedRef.current ||
            pausedRef.current
          ) {
            return;
          }
          pauseTimerRef.current = null;
          betweenSegmentsRef.current = false;
          speakSegment(index + 1);
        }, segment.pauseAfterMs);
      };
      const failPlayback = () => {
        if (!isCurrent()) return;
        utteranceRef.current = null;
        stoppedRef.current = true;
        pausedRef.current = false;
        betweenSegmentsRef.current = false;
        clearPauseTimer();
        setPlaybackError(
          'El audio se interrumpió. Podés volver a reproducirlo desde el principio.',
        );
        setPlayerState({ status: 'stopped', currentSegmentIndex: index });
      };
      utterance.onerror = failPlayback;

      try {
        synthesis.speak(utterance);
      } catch {
        failPlayback();
      }
    },
    [clearPauseTimer, voiceVariant],
  );

  const play = useCallback(
    (segments: ScriptSegment[]) => {
      const synthesis = getSpeechSynthesis();
      if (!synthesis) {
        loadVoices();
        return;
      }
      invalidatePlayback();
      // cancel() clears the queue, not the browser's paused flag.
      if (synthesis.paused) synthesis.resume();
      segmentsRef.current =
        voiceVariant === 'es-AR' ? scalePausesForArgentineDelivery(segments) : segments;
      loadVoices();
      setPlaybackError(null);
      stoppedRef.current = false;
      indexRef.current = 0;
      speakSegment(0);
    },
    [invalidatePlayback, loadVoices, speakSegment, voiceVariant],
  );

  const pause = useCallback(() => {
    if (stoppedRef.current || pausedRef.current) return;
    pausedRef.current = true;
    if (betweenSegmentsRef.current) {
      clearPauseTimer();
      remainingPauseMsRef.current = Math.max(
        0,
        remainingPauseMsRef.current - (Date.now() - pauseStartTimeRef.current),
      );
    } else {
      getSpeechSynthesis()?.pause();
    }
    setPlayerState((prev) => ({ ...prev, status: 'paused' }));
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    if (stoppedRef.current || !pausedRef.current) return;
    pausedRef.current = false;
    getSpeechSynthesis()?.resume();
    if (betweenSegmentsRef.current) {
      const sessionId = sessionIdRef.current;
      pauseStartTimeRef.current = Date.now();
      pauseTimerRef.current = setTimeout(() => {
        if (
          sessionId !== sessionIdRef.current ||
          stoppedRef.current ||
          pausedRef.current
        ) {
          return;
        }
        pauseTimerRef.current = null;
        betweenSegmentsRef.current = false;
        speakSegment(pendingNextIndexRef.current);
      }, remainingPauseMsRef.current);
    }
    setPlayerState((prev) => ({ ...prev, status: 'playing' }));
  }, [speakSegment]);

  const stop = useCallback(() => {
    invalidatePlayback();
    setPlayerState({ status: 'stopped', currentSegmentIndex: indexRef.current });
  }, [invalidatePlayback]);

  const restart = useCallback(() => {
    const synthesis = getSpeechSynthesis();
    if (!synthesis) {
      loadVoices();
      return;
    }
    invalidatePlayback();
    if (synthesis.paused) synthesis.resume();
    loadVoices();
    setPlaybackError(null);
    stoppedRef.current = false;
    speakSegment(0);
  }, [invalidatePlayback, loadVoices, speakSegment]);

  useEffect(() => {
    const unregister = registerSpeechCancel(stop);
    return () => {
      unregister();
      invalidatePlayback();
    };
  }, [invalidatePlayback, stop]);

  return {
    playerState,
    fallbackMessage,
    playbackError,
    voicesReady,
    speechSupported,
    canSpeak: speechSupported && voicesReady,
    play,
    pause,
    resume,
    stop,
    restart,
  };
}
