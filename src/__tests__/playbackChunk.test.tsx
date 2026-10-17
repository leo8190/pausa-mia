import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { Suspense } from 'react';
import {
  LazyPlaybackStep,
  loadPlaybackStep,
  prefetchPlaybackStep,
} from '../lib/playbackChunk';
import App from '../App';
import { clearGuestProgress } from '../lib/guestProgressStorage';
import type { SessionApi } from '../hooks/useSession';
import type { SessionState } from '../types';

function playbackSessionApi(): SessionApi {
  const session = {
    step: 'playback',
    script: {
      title: 'Pausa breve',
      intentionLabel: 'Calmar el ritmo',
      targetDuration: 1,
      estimatedMinutes: 1,
      segments: [{ text: 'Hola', pauseAfterMs: 0 }],
      fullText: 'Hola',
      usedDetails: [],
      engine: 'local',
    },
    checkIn: { voiceVariant: 'es-neutro' },
    autoStartPlayback: false,
  } as unknown as SessionState;

  return {
    session,
    clearAutoStartPlayback: vi.fn(),
    setStep: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionApi;
}

describe('playbackChunk', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loadPlaybackStep resuelve el módulo con PlaybackStep', async () => {
    const mod = await loadPlaybackStep();
    expect(mod).toHaveProperty('PlaybackStep');
    expect(typeof mod.PlaybackStep).toBe('function');
  });

  it('prefetchPlaybackStep no lanza', () => {
    expect(() => prefetchPlaybackStep()).not.toThrow();
  });

  it('LazyPlaybackStep monta el reproductor tras el fallback de Suspense', async () => {
    render(
      <Suspense fallback={<p>Preparando el reproductor…</p>}>
        <LazyPlaybackStep sessionApi={playbackSessionApi()} />
      </Suspense>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /^reproducción$/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/^preparando el reproductor…$/i)).not.toBeInTheDocument();
  });
});

describe('App con PlaybackStep diferido', () => {
  beforeEach(() => {
    clearGuestProgress();
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aiEnabled: false }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('el atajo Empezar ahora llega a reproducción con el chunk lazy', async () => {
    render(<App />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /empezar gratis/i }));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /permito usar mis respuestas de esta sesión únicamente/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^continuar$/i }));

    fireEvent.click(screen.getByLabelText(/ahora, en este momento/i));
    fireEvent.click(screen.getByLabelText(/calmar el ritmo/i));
    fireEvent.click(screen.getByLabelText(/experiencia básica/i));
    fireEvent.click(screen.getByLabelText(/respiración natural/i));
    fireEvent.click(screen.getByRole('button', { name: /empezar ahora/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /^reproducción$/i }),
      ).toBeInTheDocument();
    });
  });
});
