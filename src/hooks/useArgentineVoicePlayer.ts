// Reproductor de la voz argentina neuronal real (Piper/ONNX,
// `es_AR-daniela-high`). Paralelo a `useSpeechPlayer` (Web Speech), pero la
// fuente de audio es un `Blob` generado por inferencia real en el navegador
// (`voiceEngine.synthesizeArgentineVoice`), no una voz del sistema.
//
// Ciclo de vida explícito, sin pasos ocultos:
// 1. `idle`      — todavía no se preparó nada.
// 2. `preparing` — descargando/cargando el modelo (progreso visible).
// 3. `ready`     — la preparación produjo un `Blob` de audio real: ya se
//                  puede reproducir.
// 4. `playing` / `paused` / `stopped` — reproducción de los segmentos.
// 5. `error`     — la preparación o la síntesis fallaron; el mensaje describe
//                  la causa. Nunca se cae en silencio a otra voz: quien use
//                  este hook debe ofrecer, de forma explícita, una voz del
//                  dispositivo marcada como "no argentina".
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScriptSegment } from '../types';
import { synthesizeArgentineVoice, type Progress } from '../lib/voiceEngine';
import { registerSpeechCancel } from '../lib/speechController';

export type ArgentineVoiceStatus =
  'idle' | 'preparing' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';

export interface ArgentineVoicePlayerState {
  status: ArgentineVoiceStatus;
  progress: Progress | null;
  error: string | null;
  currentSegmentIndex: number;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useArgentineVoicePlayer() {
  const [state, setState] = useState<ArgentineVoicePlayerState>({
    status: 'idle',
    progress: null,
    error: null,
    currentSegmentIndex: 0,
  });

  const segmentsRef = useRef<ScriptSegment[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const betweenSegmentsRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingPauseMsRef = useRef(0);
  const pauseStartTimeRef = useRef(0);
  const pendingNextIndexRef = useRef(0);

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

  const teardownAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    releaseObjectUrl();
  }, [releaseObjectUrl]);

  /**
   * Descarga/cachea el modelo y ejecuta una síntesis real de prueba.
   * `ready` sólo se alcanza si esa síntesis devolvió un `Blob`; un `HEAD`
   * exitoso nunca es suficiente.
   */
  const prepare = useCallback(async (): Promise<boolean> => {
    stoppedRef.current = false;
    setState({
      status: 'preparing',
      progress: { loaded: 0, total: 0 },
      error: null,
      currentSegmentIndex: 0,
    });
    try {
      await synthesizeArgentineVoice('Hola. Esta es la voz argentina.', (progress) =>
        setState((prev) => ({ ...prev, progress })),
      );
      setState((prev) => ({ ...prev, status: 'ready', error: null }));
      return true;
    } catch (err) {
      setState((prev) => ({ ...prev, status: 'error', error: toErrorMessage(err) }));
      return false;
    }
  }, []);

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
      }));

      try {
        const blob = await synthesizeArgentineVoice(segments[index].text);
        if (stoppedRef.current) return;

        teardownAudio();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          if (stoppedRef.current) return;
          betweenSegmentsRef.current = true;
          pendingNextIndexRef.current = index + 1;
          pauseStartTimeRef.current = Date.now();
          pauseTimerRef.current = setTimeout(() => {
            betweenSegmentsRef.current = false;
            void playSegment(index + 1);
          }, segments[index].pauseAfterMs);
        };
        audio.onerror = () => {
          if (!stoppedRef.current) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: 'No se pudo reproducir el audio generado por la voz argentina.',
            }));
          }
        };

        await audio.play();
      } catch (err) {
        if (!stoppedRef.current) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: toErrorMessage(err),
          }));
        }
      }
    },
    [teardownAudio],
  );

  const play = useCallback(
    (segments: ScriptSegment[]) => {
      stoppedRef.current = false;
      segmentsRef.current = segments;
      clearPauseTimer();
      void playSegment(0);
    },
    [clearPauseTimer, playSegment],
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
    teardownAudio();
    setState((prev) => ({ ...prev, status: 'stopped' }));
  }, [clearPauseTimer, teardownAudio]);

  const restart = useCallback(() => {
    stoppedRef.current = false;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    teardownAudio();
    void playSegment(0);
  }, [clearPauseTimer, playSegment, teardownAudio]);

  useEffect(() => {
    const unregister = registerSpeechCancel(stop);
    return () => {
      unregister();
      stoppedRef.current = true;
      clearPauseTimer();
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
