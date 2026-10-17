import { lazy, type ComponentType } from 'react';
import type { SessionApi } from '../hooks/useSession';

type PlaybackStepProps = { sessionApi: SessionApi };

type PlaybackModule = {
  PlaybackStep: ComponentType<PlaybackStepProps>;
};

/** Carga el chunk de reproducción (voz neuronal / ONNX) solo cuando hace falta. */
export function loadPlaybackStep(): Promise<PlaybackModule> {
  return import('../components/PlaybackStep');
}

/**
 * Prefetch en idle del recorrido (check-in en adelante) para que «Empezar ahora»
 * no espere el download del chunk de voz.
 */
export function prefetchPlaybackStep(): void {
  void loadPlaybackStep();
}

export const LazyPlaybackStep = lazy(() =>
  loadPlaybackStep().then((mod) => ({ default: mod.PlaybackStep })),
);
