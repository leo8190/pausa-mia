import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaybackStep } from '../components/PlaybackStep';
import type { SessionApi } from '../hooks/useSession';
import type { SessionState } from '../types';
import * as voiceEngine from '../lib/voiceEngine';

function makeSessionApi(voiceVariant: 'es-AR' | 'es-neutro'): SessionApi {
  return {
    session: {
      script: {
        title: 'Pausa breve',
        intentionLabel: 'Calmar el ritmo',
        targetDuration: 3,
        estimatedMinutes: 3,
        segments: [
          { text: 'Cerrá los ojos y respirá.', pauseAfterMs: 10 },
          { text: 'Notá el aire entrando y saliendo.', pauseAfterMs: 10 },
        ],
        fullText: 'Cerrá los ojos y respirá. Notá el aire entrando y saliendo.',
        usedDetails: [],
        engine: 'local',
      },
      checkIn: { voiceVariant },
    } as unknown as SessionState,
    setStep: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionApi;
}

describe('PlaybackStep — voz argentina neuronal real', () => {
  beforeEach(() => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = class {};
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue({ match: vi.fn(), put: vi.fn() }) },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null } }),
    );
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    if (!('createObjectURL' in URL)) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(),
        configurable: true,
      });
    }
    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        configurable: true,
      });
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    voiceEngine.resetNeuralVoiceVerificationForTests();
    voiceEngine.resetArgentineVoiceSessionForTests();
  });

  it('starts in "not prepared" state and never claims availability before a real synthesis', async () => {
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    expect(
      screen.getByRole('button', { name: /preparar voz argentina/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reproducir voz argentina/i }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/motores de voz en este dispositivo/i),
      ).toBeInTheDocument();
    });
  });

  it('moves to "ready" and offers playback only after prepare() resolves with a real Blob', async () => {
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/x-wav' }),
    );

    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    fireEvent.click(screen.getByRole('button', { name: /preparar voz argentina/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /reproducir voz argentina/i }),
      ).toBeInTheDocument();
    });
    expect(voiceEngine.synthesizeArgentineVoice).toHaveBeenCalled();
  });

  it('shows an explicit error and requires confirmation before using a non-argentine device voice', async () => {
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockRejectedValue(
      new Error('El modelo no se pudo descargar.'),
    );

    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    fireEvent.click(screen.getByRole('button', { name: /preparar voz argentina/i }));

    await waitFor(() => {
      expect(screen.getByText(/no se pudo preparar o reproducir/i)).toBeInTheDocument();
    });
    // Never falls back silently: the device-voice option requires an explicit click.
    expect(
      screen.queryByRole('button', { name: /reproducir$/i }),
    ).not.toBeInTheDocument();
    const fallbackBtn = screen.getByRole('button', {
      name: /usar voz del dispositivo \(no es argentina\)/i,
    });
    fireEvent.click(fallbackBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          /estás usando una voz del dispositivo, no la voz argentina neuronal/i,
        ),
      ).toBeInTheDocument();
    });
  });

  it('uses the Web Speech engine directly for the neutral variant, without any neural prompt', async () => {
    render(<PlaybackStep sessionApi={makeSessionApi('es-neutro')} />);
    expect(
      screen.queryByRole('button', { name: /preparar voz argentina/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/motores de voz en este dispositivo/i),
      ).toBeInTheDocument();
    });
  });
});
