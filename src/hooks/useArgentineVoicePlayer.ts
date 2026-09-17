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
//
// Un solo HTMLAudioElement vive toda la sesión: entre frases sólo se cambia
// `src` y se llama `play()` sobre la misma instancia. Crear un Audio nuevo por
// segmento rompe la cadena de gesto del navegador (Safari/iOS pide otro toque).
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
import {
  REMOTE_ARGENTINE_PLAYBACK_RATE,
  scalePausesForArgentineDelivery,
} from '../lib/voiceCadence';

export type ArgentineVoiceMode = 'local' | 'remote';

/** Frase fija para precalentar remoto sin exponer texto del guion. */
export const REMOTE_WARMUP_TEXT = 'Hola. Esta es una pausa argentina.';

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
  /**
   * Se activa cuando el navegador exige gesto manual para reproducir el WAV.
   * Mantiene visible/montado el reproductor nativo para evitar cortes al
   * desmontar/remontar el elemento de audio en Safari/WebViews.
   */
  nativeControlsRequired: boolean;
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

/**
 * Flags seguros para compatibilidad móvil/desktop al reproducir audio generado
 * programáticamente (incluye Safari/iOS con reproducción inline).
 */
function configureAudioElementForCompatibility(audio: HTMLAudioElement): void {
  // Mantiene al navegador listo para reproducir sin diferir la carga del blob.
  audio.preload = 'auto';
  // Reproducción inline en navegadores que soportan este hint programático.
  (audio as HTMLMediaElement & { playsInline?: boolean }).playsInline = true;
  audio.setAttribute('playsinline', 'true');
  // Compatibilidad con Safari/WebKit legacy.
  audio.setAttribute('webkit-playsinline', 'true');
}

const initialState = (mode: ArgentineVoiceMode): ArgentineVoicePlayerState => ({
  status: 'idle',
  progress: null,
  error: null,
  currentSegmentIndex: 0,
  mode,
  nativeAudioUrl: null,
  nativeControlsRequired: false,
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
  // Inference may finish after AbortController.abort(), especially on mobile.
  // Only the current playback may change the shared audio element or advance.
  const playbackIdRef = useRef(0);
  const pausedRef = useRef(false);
  const synthesizingRef = useRef(false);
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

  const clearAudioHandlers = useCallback((audio: HTMLAudioElement) => {
    audio.onended = null;
    audio.onerror = null;
    audio.onplay = null;
    audio.onpause = null;
  }, []);

  const teardownAudio = useCallback(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      clearAudioHandlers(audio);
      audio.pause();
      audio.removeAttribute('src');
      if (audio.parentElement) {
        audio.parentElement.removeChild(audio);
      }
      audioRef.current = null;
    }
    releaseObjectUrl();
  }, [clearAudioHandlers, releaseObjectUrl]);

  /**
   * Una sola instancia de Audio para toda la sesión. Crear `new Audio()` por
   * frase fuerza un nuevo gesto de reproducción en Safari/iOS y WebViews.
   */
  const ensureAudioElement = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    configureAudioElementForCompatibility(audio);
    audio.controls = true;
    audio.setAttribute('controlslist', 'nodownload noplaybackrate');
    audio.setAttribute('aria-label', 'Audio de tu meditación');
    audioRef.current = audio;
    return audio;
  }, []);

  /** Cambia sólo el `src` del Audio existente; revoca el Object URL anterior. */
  const loadBlobIntoSessionAudio = useCallback(
    (blob: Blob): { audio: HTMLAudioElement; url: string } => {
      const audio = ensureAudioElement();
      clearAudioHandlers(audio);
      audio.pause();
      const previousUrl = objectUrlRef.current;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      audio.src = url;
      // Remoto: alinea cadencia con Piper local (1/SERENE_CADENCE_SCALE) si el
      // WAV aún no trae --length_scale sereno. Local ya lo tiene en síntesis.
      const rate = mode === 'remote' ? REMOTE_ARGENTINE_PLAYBACK_RATE : 1;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return { audio, url };
    },
    [clearAudioHandlers, ensureAudioElement, mode],
  );

  const resetPlaybackFlags = useCallback(() => {
    playbackIdRef.current += 1;
    stoppedRef.current = false;
    pausedRef.current = false;
    synthesizingRef.current = false;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    abortInFlight();
    teardownAudio();
  }, [abortInFlight, clearPauseTimer, teardownAudio]);

  // Al cambiar de local ↔ remoto se descarta audio y estado previos.
  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    playbackIdRef.current += 1;
    stoppedRef.current = true;
    pausedRef.current = false;
    synthesizingRef.current = false;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    abortInFlight();
    teardownAudio();
    setState(initialState(mode));
  }, [mode, abortInFlight, clearPauseTimer, teardownAudio]);

  /**
   * Local: descarga/cachea el modelo y ejecuta una síntesis de prueba.
   * Remoto: hace warm-up con una frase fija no sensible (sin guion).
   */
  const prepare = useCallback(async (): Promise<boolean> => {
    const requestMode = mode;
    playbackIdRef.current += 1;
    stoppedRef.current = false;
    pausedRef.current = false;
    synthesizingRef.current = false;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
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
      nativeControlsRequired: false,
    });

    try {
      if (requestMode === 'remote') {
        if (!isRemoteArgentineTtsConfigured()) {
          throw new Error(
            'No hay un endpoint remoto configurado (VITE_ARGENTINE_TTS_ENDPOINT).',
          );
        }
        await synthesizeRemoteArgentineVoice(REMOTE_WARMUP_TEXT, {
          signal: controller.signal,
        });
        if (isStale()) return false;
        setState((prev) => ({
          ...prev,
          status: 'ready',
          error: null,
          mode: requestMode,
          nativeAudioUrl: null,
          nativeControlsRequired: false,
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
        nativeControlsRequired: false,
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
        nativeControlsRequired: false,
      }));
      return false;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [abortInFlight, clearPauseTimer, mode, teardownAudio]);

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
      clearPauseTimer();
      const playbackId = playbackIdRef.current;
      betweenSegmentsRef.current = true;
      pendingNextIndexRef.current = index + 1;
      pauseStartTimeRef.current = Date.now();
      const segments = segmentsRef.current;
      remainingPauseMsRef.current = segments[index]?.pauseAfterMs ?? 0;
      if (pausedRef.current) return;
      pauseTimerRef.current = setTimeout(() => {
        if (
          playbackIdRef.current !== playbackId ||
          stoppedRef.current ||
          pausedRef.current
        )
          return;
        betweenSegmentsRef.current = false;
        void playSegmentRef.current(index + 1);
      }, remainingPauseMsRef.current);
    },
    [clearPauseTimer, mode],
  );

  const playSegment = useCallback(
    async (index: number) => {
      if (stoppedRef.current) return;
      const playbackId = ++playbackIdRef.current;
      const isCurrent = () =>
        playbackIdRef.current === playbackId &&
        !stoppedRef.current &&
        modeRef.current === mode;
      const segments = segmentsRef.current;
      if (index >= segments.length) {
        stoppedRef.current = true;
        betweenSegmentsRef.current = false;
        teardownAudio();
        setState((prev) => ({
          ...prev,
          status: 'stopped',
          currentSegmentIndex: segments.length,
          nativeAudioUrl: null,
          nativeControlsRequired: false,
        }));
        return;
      }

      betweenSegmentsRef.current = false;
      synthesizingRef.current = true;
      if (audioRef.current) {
        clearAudioHandlers(audioRef.current);
        audioRef.current.pause();
      }
      // No resetear nativeControlsRequired: si el gesto ya exigió controles
      // nativos, el host debe permanecer montado entre frases.
      setState((prev) => ({
        ...prev,
        status: 'playing',
        currentSegmentIndex: index,
        error: null,
        mode,
      }));

      try {
        const blob = await synthesizeSegment(segments[index].text);
        if (!isCurrent()) return;
        synthesizingRef.current = false;

        const { audio, url } = loadBlobIntoSessionAudio(blob);
        setState((prev) => ({
          ...prev,
          currentSegmentIndex: index,
          mode,
          nativeAudioUrl: url,
          error: null,
        }));

        audio.onended = () => {
          if (!isCurrent() || betweenSegmentsRef.current) return;
          scheduleNextSegment(index);
        };
        audio.onerror = () => {
          if (!isCurrent()) return;
          stoppedRef.current = true;
          teardownAudio();
          setState((prev) => ({
            ...prev,
            status: 'error',
            nativeAudioUrl: null,
            nativeControlsRequired: false,
            error:
              mode === 'remote'
                ? 'No se pudo reproducir el audio WAV del servicio remoto.'
                : 'No se pudo reproducir el audio generado por la voz argentina.',
          }));
        };
        audio.onplay = () => {
          if (!isCurrent() || audio.paused) return;
          pausedRef.current = false;
          setState((prev) => ({
            ...prev,
            status: 'playing',
            nativeAudioUrl: objectUrlRef.current,
          }));
        };
        audio.onpause = () => {
          if (!isCurrent()) return;
          if (!audio.paused || audio.ended || betweenSegmentsRef.current) return;
          pausedRef.current = true;
          setState((prev) => {
            if (prev.status !== 'playing' && prev.status !== 'needs-native-play') {
              return prev;
            }
            return { ...prev, status: 'paused', nativeAudioUrl: objectUrlRef.current };
          });
        };

        if (pausedRef.current) return;
        try {
          await audio.play();
          if (!isCurrent()) return;
          if (pausedRef.current) {
            audio.pause();
            return;
          }
          setState((prev) => ({
            ...prev,
            status: 'playing',
            nativeAudioUrl: url,
          }));
        } catch (playErr) {
          if (!isCurrent() || isAbortLike(playErr)) {
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
              nativeControlsRequired: true,
            }));
            return;
          }
          throw playErr;
        }
      } catch (err) {
        if (!isCurrent() || isAbortLike(err)) {
          return;
        }
        synthesizingRef.current = false;
        stoppedRef.current = true;
        teardownAudio();
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: toErrorMessage(err),
          nativeAudioUrl: null,
          nativeControlsRequired: false,
        }));
      }
    },
    [
      clearAudioHandlers,
      loadBlobIntoSessionAudio,
      mode,
      scheduleNextSegment,
      synthesizeSegment,
      teardownAudio,
    ],
  );

  playSegmentRef.current = playSegment;

  const play = useCallback(
    (segments: ScriptSegment[]) => {
      resetPlaybackFlags();
      setState((prev) => ({
        ...prev,
        nativeAudioUrl: null,
        nativeControlsRequired: false,
      }));

      if (mode === 'remote') {
        try {
          assertRemoteSessionTextLimits(segments.map((s) => s.text).join('\n'));
        } catch (err) {
          stoppedRef.current = true;
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: toErrorMessage(err),
            mode,
            nativeAudioUrl: null,
            nativeControlsRequired: false,
          }));
          return;
        }
      }

      segmentsRef.current = scalePausesForArgentineDelivery(segments);
      void playSegment(0);
    },
    [resetPlaybackFlags, mode, playSegment],
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
      audioRef.current?.pause();
    }
    setState((prev) => ({ ...prev, status: 'paused' }));
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    if (stoppedRef.current) return;
    const playbackId = playbackIdRef.current;
    const isCurrent = () => playbackIdRef.current === playbackId && !stoppedRef.current;
    pausedRef.current = false;
    if (betweenSegmentsRef.current) {
      clearPauseTimer();
      pauseStartTimeRef.current = Date.now();
      pauseTimerRef.current = setTimeout(() => {
        if (!isCurrent() || pausedRef.current) return;
        betweenSegmentsRef.current = false;
        void playSegment(pendingNextIndexRef.current);
      }, remainingPauseMsRef.current);
      setState((prev) => ({ ...prev, status: 'playing', nativeAudioUrl: null }));
      return;
    }

    if (synthesizingRef.current) {
      setState((prev) => ({ ...prev, status: 'playing' }));
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;

    void audio
      .play()
      .then(() => {
        if (!isCurrent()) return;
        if (pausedRef.current) {
          audio.pause();
          return;
        }
        setState((prev) => ({
          ...prev,
          status: 'playing',
          nativeAudioUrl: objectUrlRef.current,
        }));
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
        if (isAutoplayPolicyError(err) && objectUrlRef.current) {
          audio.controls = true;
          setState((prev) => ({
            ...prev,
            status: 'needs-native-play',
            error: null,
            nativeAudioUrl: objectUrlRef.current,
            nativeControlsRequired: true,
          }));
          return;
        }
        if (!isAbortLike(err)) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: toErrorMessage(err),
            nativeAudioUrl: null,
            nativeControlsRequired: false,
          }));
        }
      });
  }, [clearPauseTimer, playSegment]);

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
    playbackIdRef.current += 1;
    stoppedRef.current = true;
    pausedRef.current = false;
    synthesizingRef.current = false;
    betweenSegmentsRef.current = false;
    clearPauseTimer();
    abortInFlight();
    teardownAudio();
    setState((prev) => ({
      ...prev,
      status: 'stopped',
      nativeAudioUrl: null,
      nativeControlsRequired: false,
    }));
  }, [abortInFlight, clearPauseTimer, teardownAudio]);

  const restart = useCallback(() => {
    resetPlaybackFlags();
    setState((prev) => ({
      ...prev,
      nativeAudioUrl: null,
      nativeControlsRequired: false,
    }));
    void playSegment(0);
  }, [playSegment, resetPlaybackFlags]);

  useEffect(() => {
    const unregister = registerSpeechCancel(stop);
    return () => {
      unregister();
      playbackIdRef.current += 1;
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
