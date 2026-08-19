// Reproductor de la voz argentina neuronal (Piper local u opcionalmente remoto).
// Paralelo a `useSpeechPlayer` (Web Speech): la fuente es un `Blob` WAV reproducido
// con HTMLAudioElement, no una voz del sistema.
//
// Modo `local` (por defecto): inferencia Piper/ONNX en el navegador.
// Modo `remote`: POST del texto del segmento a VITE_ARGENTINE_TTS_ENDPOINT.
// El modo remoto nunca se activa solo: lo elige la UI con consentimiento explícito.
// Cambiar de modo cancela la síntesis en curso y descarta audio/estado previos.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScriptSegment } from '../types';
import { synthesizeArgentineVoice, type Progress } from '../lib/voiceEngine';
import {
  assertRemoteSessionTextLimits,
  isRemoteArgentineTtsConfigured,
  RemoteVoiceError,
  synthesizeRemoteArgentineVoice,
} from '../lib/remoteVoiceService';
import { registerSpeechCancel } from '../lib/speechController';

export type ArgentineVoiceMode = 'local' | 'remote';

export type ArgentineVoiceStatus =
  'idle' | 'preparing' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';

export interface ArgentineVoicePlayerState {
  status: ArgentineVoiceStatus;
  progress: Progress | null;
  error: string | null;
  currentSegmentIndex: number;
  mode: ArgentineVoiceMode;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isAbortLike(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    if (err.name === 'AbortError') return true;
  }
  if (err instanceof RemoteVoiceError && err.code === 'aborted') return true;
  return err instanceof Error && err.name === 'AbortError';
}

export function useArgentineVoicePlayer(mode: ArgentineVoiceMode = 'local') {
  const [state, setState] = useState<ArgentineVoicePlayerState>({
    status: 'idle',
    progress: null,
    error: null,
    currentSegmentIndex: 0,
    mode,
  });

  const modeRef = useRef(mode);
  const segmentsRef = useRef<ScriptSegment[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const betweenSegmentsRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingPauseMsRef = useRef(0);
  const pauseStartTimeRef = useRef(0);
  const pendingNextIndexRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const abortInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const teardownAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    releaseObjectUrl();
  }, [releaseObjectUrl]);

  const resetPlaybackFlags = useCallback(() => {
    stoppedRef.current = false;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    abortInFlight();
    teardownAudio();
  }, [abortInFlight, clearPauseTimer, teardownAudio]);

  // Al cambiar de local ↔ remoto se descarta audio y estado previos.
  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    stoppedRef.current = true;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    abortInFlight();
    teardownAudio();
    setState({
      status: 'idle',
      progress: null,
      error: null,
      currentSegmentIndex: 0,
      mode,
    });
  }, [mode, abortInFlight, clearPauseTimer, teardownAudio]);

  /**
   * Local: descarga/cachea el modelo y ejecuta una síntesis de prueba.
   * Remoto: verifica endpoint configurado; no envía el guion (ni frase de prueba).
   */
  const prepare = useCallback(async (): Promise<boolean> => {
    const requestMode = mode;
    stoppedRef.current = false;
    abortInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    const isStale = () => controller.signal.aborted || modeRef.current !== requestMode;

    setState({
      status: 'preparing',
      progress: requestMode === 'local' ? { loaded: 0, total: 0 } : null,
      error: null,
      currentSegmentIndex: 0,
      mode: requestMode,
    });

    try {
      if (requestMode === 'remote') {
        if (!isRemoteArgentineTtsConfigured()) {
          throw new Error(
            'No hay un endpoint remoto configurado (VITE_ARGENTINE_TTS_ENDPOINT).',
          );
        }
        if (isStale()) return false;
        setState((prev) => ({
          ...prev,
          status: 'ready',
          error: null,
          mode: requestMode,
        }));
        return true;
      }

      await synthesizeArgentineVoice(
        'Hola. Esta es la voz argentina.',
        (progress) => {
          if (isStale()) return;
          setState((prev) => ({ ...prev, progress }));
        },
        controller.signal,
      );
      if (isStale()) return false;
      setState((prev) => ({
        ...prev,
        status: 'ready',
        error: null,
        mode: requestMode,
      }));
      return true;
    } catch (err) {
      if (isStale() || isAbortLike(err)) return false;
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: toErrorMessage(err),
        mode: requestMode,
      }));
      return false;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [abortInFlight, mode]);

  const synthesizeSegment = useCallback(
    async (text: string): Promise<Blob> => {
      abortInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        if (mode === 'remote') {
          return await synthesizeRemoteArgentineVoice(text, {
            signal: controller.signal,
          });
        }
        return await synthesizeArgentineVoice(text, undefined, controller.signal);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [abortInFlight, mode],
  );

  const playSegment = useCallback(
    async (index: number) => {
      if (stoppedRef.current) return;
      const segments = segmentsRef.current;
      if (index >= segments.length) {
        betweenSegmentsRef.current = false;
        setState((prev) => ({
          ...prev,
          status: 'stopped',
          currentSegmentIndex: segments.length,
        }));
        return;
      }

      betweenSegmentsRef.current = false;
      setState((prev) => ({
        ...prev,
        status: 'playing',
        currentSegmentIndex: index,
        error: null,
        mode,
      }));

      try {
        const blob = await synthesizeSegment(segments[index].text);
        if (stoppedRef.current || modeRef.current !== mode) return;

        teardownAudio();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          if (stoppedRef.current || modeRef.current !== mode) return;
          betweenSegmentsRef.current = true;
          pendingNextIndexRef.current = index + 1;
          pauseStartTimeRef.current = Date.now();
          pauseTimerRef.current = setTimeout(() => {
            betweenSegmentsRef.current = false;
            void playSegment(index + 1);
          }, segments[index].pauseAfterMs);
        };
        audio.onerror = () => {
          if (stoppedRef.current || modeRef.current !== mode) return;
          setState((prev) => ({
            ...prev,
            status: 'error',
            error:
              mode === 'remote'
                ? 'No se pudo reproducir el audio WAV del servicio remoto.'
                : 'No se pudo reproducir el audio generado por la voz argentina.',
          }));
        };

        await audio.play();
      } catch (err) {
        if (stoppedRef.current || modeRef.current !== mode || isAbortLike(err)) {
          return;
        }
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: toErrorMessage(err),
        }));
      }
    },
    [mode, synthesizeSegment, teardownAudio],
  );

  const play = useCallback(
    (segments: ScriptSegment[]) => {
      stoppedRef.current = false;
      clearPauseTimer();
      abortInFlight();

      if (mode === 'remote') {
        try {
          assertRemoteSessionTextLimits(segments.map((s) => s.text).join('\n'));
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: toErrorMessage(err),
            mode,
          }));
          return;
        }
      }

      segmentsRef.current = segments;
      void playSegment(0);
    },
    [abortInFlight, clearPauseTimer, mode, playSegment],
  );

  const pause = useCallback(() => {
    if (betweenSegmentsRef.current) {
      clearPauseTimer();
      const segment = segmentsRef.current[pendingNextIndexRef.current - 1];
      remainingPauseMsRef.current = Math.max(
        0,
        (segment?.pauseAfterMs ?? 0) - (Date.now() - pauseStartTimeRef.current),
      );
    } else {
      audioRef.current?.pause();
    }
    setState((prev) => ({ ...prev, status: 'paused' }));
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    if (betweenSegmentsRef.current) {
      pauseTimerRef.current = setTimeout(() => {
        betweenSegmentsRef.current = false;
        void playSegment(pendingNextIndexRef.current);
      }, remainingPauseMsRef.current);
      setState((prev) => ({ ...prev, status: 'playing' }));
    } else if (audioRef.current) {
      void audioRef.current.play();
      setState((prev) => ({ ...prev, status: 'playing' }));
    }
  }, [playSegment]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    abortInFlight();
    teardownAudio();
    setState((prev) => ({ ...prev, status: 'stopped' }));
  }, [abortInFlight, clearPauseTimer, teardownAudio]);

  const restart = useCallback(() => {
    resetPlaybackFlags();
    void playSegment(0);
  }, [playSegment, resetPlaybackFlags]);

  useEffect(() => {
    const unregister = registerSpeechCancel(stop);
    return () => {
      unregister();
      stoppedRef.current = true;
      clearPauseTimer();
      abortInFlight();
      teardownAudio();
    };
    // Se registra/limpia una sola vez por instancia del hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    prepare,
    play,
    pause,
    resume,
    stop,
    restart,
  };
}
