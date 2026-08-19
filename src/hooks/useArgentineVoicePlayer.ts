// Reproductor de la voz argentina neuronal (Piper local u opcionalmente remoto).
// Paralelo a `useSpeechPlayer` (Web Speech): la fuente es un `Blob` WAV reproducido
// con HTMLAudioElement, no una voz del sistema.
//
// Modo `local` (por defecto): inferencia Piper/ONNX en el navegador.
// Modo `remote`: POST del texto del segmento a VITE_ARGENTINE_TTS_ENDPOINT.
// El modo remoto nunca se activa solo: lo elige la UI con consentimiento explícito.
// Cambiar de modo cancela la síntesis en curso y descarta audio/estado previos.
//
// Si `audio.play()` falla por política de autoplay (NotAllowedError), no se deja
// la sesión en error inutilizable: se expone el WAV con controles nativos y
// acciones para abrirlo en el visor del dispositivo o descargarlo. El Object URL
// es anónimo (blob:) y el nombre de descarga no incluye texto del guion.
// Se revoca al cambiar de segmento, detener, cambiar de modo o desmontar.
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
import { normalizeTextForTts } from '../lib/ttsPronunciation';

export type ArgentineVoiceMode = 'local' | 'remote';

export type ArgentineVoiceStatus =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'needs-native-play';

export interface ArgentineVoicePlayerState {
  status: ArgentineVoiceStatus;
  progress: Progress | null;
  error: string | null;
  currentSegmentIndex: number;
  mode: ArgentineVoiceMode;
  /** Object URL del WAV del segmento actual (reproductor nativo / abrir / descargar). */
  nativeAudioUrl: string | null;
}

/** Nombre de archivo genérico: nunca incluye texto del guion ni datos íntimos. */
export function argentineWavDownloadName(segmentIndex: number): string {
  const n = Number.isFinite(segmentIndex)
    ? Math.max(1, Math.floor(segmentIndex) + 1)
    : 1;
  return `pausa-mia-segmento-${n}.wav`;
}

/** Detecta bloqueo de autoplay / gesto de usuario (Safari/iOS y políticas similares). */
export function isAutoplayPolicyError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return true;
  }
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError') return true;
    return /notallowed|user.?gesture|autoplay/i.test(err.message);
  }
  return false;
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

const initialState = (mode: ArgentineVoiceMode): ArgentineVoicePlayerState => ({
  status: 'idle',
  progress: null,
  error: null,
  currentSegmentIndex: 0,
  mode,
  nativeAudioUrl: null,
});

export function useArgentineVoicePlayer(mode: ArgentineVoiceMode = 'local') {
  const [state, setState] = useState<ArgentineVoicePlayerState>(() =>
    initialState(mode),
  );

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
  const playSegmentRef = useRef<(index: number) => Promise<void>>(async () => {});

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
      const audio = audioRef.current;
      audio.onended = null;
      audio.onerror = null;
      audio.onplay = null;
      audio.onpause = null;
      audio.pause();
      audio.removeAttribute('src');
      if (audio.parentElement) {
        audio.parentElement.removeChild(audio);
      }
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
    setState(initialState(mode));
  }, [mode, abortInFlight, clearPauseTimer, teardownAudio]);

  /**
   * Local: descarga/cachea el modelo y ejecuta una síntesis de prueba.
   * Remoto: verifica endpoint configurado; no envía el guion (ni frase de prueba).
   */
  const prepare = useCallback(async (): Promise<boolean> => {
    const requestMode = mode;
    stoppedRef.current = false;
    abortInFlight();
    teardownAudio();
    const controller = new AbortController();
    abortRef.current = controller;
    const isStale = () => controller.signal.aborted || modeRef.current !== requestMode;

    setState({
      status: 'preparing',
      progress: requestMode === 'local' ? { loaded: 0, total: 0 } : null,
      error: null,
      currentSegmentIndex: 0,
      mode: requestMode,
      nativeAudioUrl: null,
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
          nativeAudioUrl: null,
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
        nativeAudioUrl: null,
      }));
      return true;
    } catch (err) {
      if (isStale() || isAbortLike(err)) return false;
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: toErrorMessage(err),
        mode: requestMode,
        nativeAudioUrl: null,
      }));
      return false;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [abortInFlight, mode, teardownAudio]);

  const synthesizeSegment = useCallback(
    async (text: string): Promise<Blob> => {
      abortInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        if (mode === 'remote') {
          return await synthesizeRemoteArgentineVoice(normalizeTextForTts(text), {
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

  const scheduleNextSegment = useCallback(
    (index: number) => {
      if (stoppedRef.current || modeRef.current !== mode) return;
      betweenSegmentsRef.current = true;
      pendingNextIndexRef.current = index + 1;
      pauseStartTimeRef.current = Date.now();
      const segments = segmentsRef.current;
      pauseTimerRef.current = setTimeout(() => {
        betweenSegmentsRef.current = false;
        void playSegmentRef.current(index + 1);
      }, segments[index]?.pauseAfterMs ?? 0);
    },
    [mode],
  );

  const playSegment = useCallback(
    async (index: number) => {
      if (stoppedRef.current) return;
      const segments = segmentsRef.current;
      if (index >= segments.length) {
        betweenSegmentsRef.current = false;
        teardownAudio();
        setState((prev) => ({
          ...prev,
          status: 'stopped',
          currentSegmentIndex: segments.length,
          nativeAudioUrl: null,
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
        audio.controls = true;
        audio.setAttribute(
          'aria-label',
          'Reproductor nativo del audio WAV de este segmento',
        );
        audioRef.current = audio;
        setState((prev) => ({
          ...prev,
          currentSegmentIndex: index,
          mode,
          nativeAudioUrl: url,
          error: null,
        }));

        audio.onended = () => {
          if (stoppedRef.current || modeRef.current !== mode) return;
          scheduleNextSegment(index);
        };
        audio.onerror = () => {
          if (stoppedRef.current || modeRef.current !== mode) return;
          teardownAudio();
          setState((prev) => ({
            ...prev,
            status: 'error',
            nativeAudioUrl: null,
            error:
              mode === 'remote'
                ? 'No se pudo reproducir el audio WAV del servicio remoto.'
                : 'No se pudo reproducir el audio generado por la voz argentina.',
          }));
        };
        audio.onplay = () => {
          if (stoppedRef.current || modeRef.current !== mode) return;
          setState((prev) => ({
            ...prev,
            status: 'playing',
            nativeAudioUrl: objectUrlRef.current,
          }));
        };
        audio.onpause = () => {
          if (stoppedRef.current || modeRef.current !== mode) return;
          if (audio.ended || betweenSegmentsRef.current) return;
          setState((prev) => {
            if (prev.status !== 'playing' && prev.status !== 'needs-native-play') {
              return prev;
            }
            return { ...prev, status: 'paused', nativeAudioUrl: objectUrlRef.current };
          });
        };

        try {
          await audio.play();
          setState((prev) => ({
            ...prev,
            status: 'playing',
            nativeAudioUrl: url,
          }));
        } catch (playErr) {
          if (stoppedRef.current || modeRef.current !== mode || isAbortLike(playErr)) {
            return;
          }
          if (isAutoplayPolicyError(playErr)) {
            setState((prev) => ({
              ...prev,
              status: 'needs-native-play',
              error: null,
              nativeAudioUrl: url,
              currentSegmentIndex: index,
              mode,
            }));
            return;
          }
          throw playErr;
        }
      } catch (err) {
        if (stoppedRef.current || modeRef.current !== mode || isAbortLike(err)) {
          return;
        }
        teardownAudio();
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: toErrorMessage(err),
          nativeAudioUrl: null,
        }));
      }
    },
    [mode, scheduleNextSegment, synthesizeSegment, teardownAudio],
  );

  playSegmentRef.current = playSegment;

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
            nativeAudioUrl: null,
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
      setState((prev) => ({ ...prev, status: 'playing', nativeAudioUrl: null }));
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    void audio
      .play()
      .then(() => {
        setState((prev) => ({
          ...prev,
          status: 'playing',
          nativeAudioUrl: objectUrlRef.current,
        }));
      })
      .catch((err: unknown) => {
        if (isAutoplayPolicyError(err) && objectUrlRef.current) {
          audio.controls = true;
          setState((prev) => ({
            ...prev,
            status: 'needs-native-play',
            error: null,
            nativeAudioUrl: objectUrlRef.current,
          }));
          return;
        }
        if (!isAbortLike(err)) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: toErrorMessage(err),
            nativeAudioUrl: null,
          }));
        }
      });
  }, [playSegment]);

  /**
   * Monta el HTMLAudioElement programático dentro de un host visible para
   * ofrecer controles nativos (también cuando el autoplay está bloqueado).
   */
  const mountNativeAudioElement = useCallback((host: HTMLElement | null) => {
    const audio = audioRef.current;
    if (!host || !audio) return;
    audio.controls = true;
    if (audio.parentElement !== host) {
      host.replaceChildren(audio);
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    abortInFlight();
    teardownAudio();
    setState((prev) => ({
      ...prev,
      status: 'stopped',
      nativeAudioUrl: null,
    }));
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
    mountNativeAudioElement,
  };
}
