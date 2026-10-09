import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScriptSegment } from '../types';
import {
  NativeVoice,
  isNativeAndroidVoice,
  type NativeVoiceEvent,
} from '../lib/nativeVoice';
import {
  LEONARDO_DELIVERY_SPEED,
  LEONARDO_VOICE_ID,
  LeonardoVoiceError,
  synthesizeLeonardoVoice,
} from '../lib/leonardoVoice';
import { registerSpeechCancel } from '../lib/speechController';
import { createAudioObservation } from '../lib/productFunnel';

type Status =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'needs-native-play';
let serial = 0;
export function useLeonardoVoicePlayer() {
  const native = isNativeAndroidVoice();
  const [state, setState] = useState({
    status: 'idle' as Status,
    currentSegmentIndex: 0,
    completed: 0,
    error: null as string | null,
  });
  const [nativeReady, setNativeReady] = useState(!native);
  const request = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const cache = useRef<Blob[]>([]);
  const scripts = useRef<ScriptSegment[]>([]);
  const index = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseStarted = useRef(0);
  const remainingPause = useRef(0);
  const between = useRef(false);
  const paused = useRef(false);
  const observed = useRef(-1);
  const observation = useRef<ReturnType<typeof createAudioObservation> | null>(null);
  const next = useRef<(i: number) => void>(() => {});
  const release = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (audio.current) {
      audio.current.onplaying = null;
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.onpause = null;
      audio.current.pause();
      audio.current.removeAttribute('src');
    }
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    between.current = false;
    paused.current = false;
  }, []);
  const stop = useCallback(() => {
    request.current = null;
    abort.current?.abort();
    observation.current?.invalidate();
    release();
    if (native) void NativeVoice.stop().catch(() => {});
    setState((previous) => ({ ...previous, status: 'stopped' }));
  }, [native, release]);
  const markStarted = useCallback((i: number) => {
    if (observed.current === i) return;
    if (i !== observed.current + 1) observation.current?.invalidate();
    if (observed.current >= 0) observation.current?.ended(observed.current);
    observed.current = i;
    observation.current?.started(i);
  }, []);
  useEffect(() => {
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    const onState = (event: NativeVoiceEvent) => {
      if (disposed || !request.current || event.requestId !== request.current) return;
      if (event.status === 'playing') markStarted(event.currentSegmentIndex);
      if (event.completed) {
        if (observed.current >= 0) observation.current?.ended(observed.current);
        observation.current?.complete();
        request.current = null;
      }
      if (event.status === 'error') {
        observation.current?.failed();
        request.current = null;
      }
      setState((previous) => ({
        ...previous,
        status: event.status,
        currentSegmentIndex: event.currentSegmentIndex,
        error:
          event.status === 'error'
            ? 'El audio se interrumpió. Podés volver a intentar.'
            : null,
      }));
    };
    if (native)
      void NativeVoice.addListener('state', onState)
        .then((listener) => {
          remove = () => listener.remove();
          if (disposed) void remove();
          else setNativeReady(true);
        })
        .catch(() => {
          if (!disposed) setNativeReady(false);
        });
    const sync = () => {
      if (native && !document.hidden)
        void NativeVoice.getState()
          .then(onState)
          .catch(() => {});
    };
    document.addEventListener('visibilitychange', sync);
    const unregister = registerSpeechCancel(stop);
    return () => {
      disposed = true;
      unregister();
      document.removeEventListener('visibilitychange', sync);
      request.current = null;
      abort.current?.abort();
      observation.current?.invalidate();
      release();
      cache.current = [];
      void remove?.();
      if (native) void NativeVoice.stop().catch(() => {});
    };
  }, [native, stop, release, markStarted]);

  const playBrowser = useCallback(
    (i: number) => {
      const id = request.current;
      if (!id || paused.current) return;
      if (i >= cache.current.length) {
        if (observed.current >= 0) observation.current?.ended(observed.current);
        observation.current?.complete();
        request.current = null;
        setState((p) => ({ ...p, status: 'stopped', currentSegmentIndex: i }));
        return;
      }
      const player = audio.current ?? new Audio();
      audio.current = player;
      player.onplaying = null;
      player.onended = null;
      player.onpause = null;
      player.onerror = null;
      player.pause();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(cache.current[i]);
      player.src = url.current;
      player.controls = true;
      player.setAttribute('aria-label', 'Audio con la voz de Leonardo');
      player.preload = 'auto';
      player.playbackRate = 1;
      player.defaultPlaybackRate = 1;
      player.preservesPitch = true;
      index.current = i;
      between.current = false;
      player.onplaying = () => {
        if (request.current === id) {
          markStarted(i);
          setState((p) => ({ ...p, status: 'playing', currentSegmentIndex: i }));
        }
      };
      player.onpause = () => {
        if (request.current === id && !player.ended && !between.current) {
          paused.current = true;
          setState((p) => ({ ...p, status: 'paused' }));
        }
      };
      player.onended = () => {
        if (request.current !== id) return;
        between.current = true;
        remainingPause.current = scripts.current[i].pauseAfterMs;
        pauseStarted.current = Date.now();
        if (!paused.current)
          timer.current = setTimeout(() => {
            timer.current = null;
            next.current(i + 1);
          }, remainingPause.current);
      };
      player.onerror = () => {
        if (request.current === id) {
          request.current = null;
          observation.current?.failed();
          release();
          setState((p) => ({
            ...p,
            status: 'error',
            error: 'El audio se interrumpió. Podés volver a intentar.',
          }));
        }
      };
      void player.play().catch(() => {
        if (request.current === id)
          setState((p) => ({ ...p, status: 'needs-native-play' }));
      });
    },
    [markStarted, release],
  );
  next.current = playBrowser;
  const startPrepared = useCallback(
    async (id: string) => {
      observation.current = createAudioObservation(scripts.current.length);
      observed.current = -1;
      paused.current = false;
      if (native) {
        const parts = [];
        for (let i = 0; i < cache.current.length; i++) {
          const bytes = new Uint8Array(await cache.current[i].arrayBuffer());
          if (request.current !== id) return;
          let binary = '';
          for (let start = 0; start < bytes.length; start += 8192)
            binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
          parts.push({
            audioBase64: btoa(binary),
            contentType: cache.current[i].type as 'audio/wav' | 'audio/mpeg',
            pauseAfterMs: scripts.current[i].pauseAfterMs,
          });
        }
        if (request.current === id)
          await NativeVoice.playAudio({
            requestId: id,
            voiceId: LEONARDO_VOICE_ID,
            deliverySpeed: LEONARDO_DELIVERY_SPEED,
            segments: parts,
          });
      } else playBrowser(0);
    },
    [native, playBrowser],
  );
  const play = useCallback(
    (items: ScriptSegment[], consent: boolean) => {
      if (!consent || !nativeReady) return;
      const cached = scripts.current === items && cache.current.length === items.length;
      stop();
      const id = `leonardo-${Date.now()}-${++serial}`;
      request.current = id;
      index.current = 0;
      scripts.current = items;
      abort.current = new AbortController();
      setState({
        status: 'preparing',
        currentSegmentIndex: 0,
        completed: 0,
        error: null,
      });
      void (async () => {
        try {
          if (
            !items.length ||
            items.length > 120 ||
            items.some(
              (part) =>
                !part.text.trim() ||
                part.text.length > 800 ||
                !Number.isFinite(part.pauseAfterMs) ||
                part.pauseAfterMs < 0 ||
                part.pauseAfterMs > 60000,
            ) ||
            items.reduce((n, p) => n + p.text.length, 0) > 12000
          )
            throw new Error();
          if (!cached) {
            cache.current = [];
            const prepared: Blob[] = [];
            let bytes = 0;
            for (const part of items) {
              const result = await synthesizeLeonardoVoice(part.text, {
                consent,
                signal: abort.current!.signal,
              });
              if (request.current !== id) return;
              bytes += result.audio.size;
              if (bytes > 24 * 1024 * 1024) throw new Error();
              prepared.push(result.audio);
              setState((p) => ({ ...p, completed: prepared.length }));
            }
            cache.current = prepared;
          }
          if (request.current !== id) return;
          setState((p) => ({ ...p, status: 'ready' }));
          await startPrepared(id);
        } catch (err) {
          if (request.current !== id) return;
          request.current = null;
          cache.current = [];
          observation.current?.failed();
          release();
          const actionable =
            err instanceof LeonardoVoiceError &&
            (err.code === 'auth_required' || err.code === 'limit_reached');
          setState((p) => ({
            ...p,
            status: 'error',
            error: actionable
              ? err.message
              : 'No pudimos preparar la voz de Leonardo. Podés volver a intentar o leer el guion.',
          }));
        }
      })();
    },
    [nativeReady, stop, startPrepared, release],
  );
  const pause = useCallback(() => {
    if (!request.current) return;
    paused.current = true;
    if (native) {
      void NativeVoice.pause().catch(() => {});
      return;
    }
    if (between.current) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      remainingPause.current = Math.max(
        0,
        remainingPause.current - (Date.now() - pauseStarted.current),
      );
    } else audio.current?.pause();
    setState((p) => ({ ...p, status: 'paused' }));
  }, [native]);
  const resume = useCallback(() => {
    if (!request.current) return;
    paused.current = false;
    if (native) {
      void NativeVoice.resume().catch(() => {});
      return;
    }
    if (between.current) {
      pauseStarted.current = Date.now();
      const id = request.current;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (request.current === id) next.current(index.current + 1);
      }, remainingPause.current);
      setState((p) => ({ ...p, status: 'playing' }));
    } else
      void audio.current
        ?.play()
        .catch(() => setState((p) => ({ ...p, status: 'needs-native-play' })));
  }, [native]);
  const mountAudio = useCallback((host: HTMLDivElement | null) => {
    if (host && audio.current && audio.current.parentElement !== host)
      host.append(audio.current);
  }, []);
  return { state, nativeReady, native, play, pause, resume, stop, mountAudio };
}
