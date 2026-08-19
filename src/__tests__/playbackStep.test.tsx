import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaybackStep } from '../components/PlaybackStep';
import type { SessionApi } from '../hooks/useSession';
import type { SessionState } from '../types';
import * as voiceEngine from '../lib/voiceEngine';
import * as remoteVoice from '../lib/remoteVoiceService';

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
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(false);
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

  it('shows the remote alternative when the endpoint is configured, even if local Piper is idle', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);

    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);

    await waitFor(() => {
      expect(
        screen.getByText(/motores de voz en este dispositivo/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /preparar voz argentina/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/evita descargar el modelo local/i)).toBeInTheDocument();
    expect(screen.getByText(/wav estándar/i)).toBeInTheDocument();

    const remoteButton = screen.getByRole('button', {
      name: /usar voz argentina remota/i,
    });
    const consent = screen.getByRole('checkbox', {
      name: /acepto enviar sólo el texto del guion/i,
    });
    expect(consent).not.toBeChecked();
    expect(remoteButton).toBeDisabled();
  });

  it('requires remote consent before switching, then prepares remote playback controls', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    const localSpy = vi.spyOn(voiceEngine, 'synthesizeArgentineVoice');
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
    );

    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);

    const remoteButton = screen.getByRole('button', {
      name: /usar voz argentina remota/i,
    });
    expect(remoteButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /acepto enviar sólo el texto del guion/i,
      }),
    );
    expect(remoteButton).toBeEnabled();
    fireEvent.click(remoteButton);

    await waitFor(() => {
      expect(
        screen.getByText(/estás usando la voz argentina remota/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/sin diario, perfil ni fuentes/i)).toBeInTheDocument();
    expect(localSpy).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /reproducir voz argentina remota/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /reproducir voz argentina remota/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pausar/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /pausar/i }));
    expect(screen.getByRole('button', { name: /^continuar$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /detener/i }));
    expect(screen.getByText(/detenido/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reiniciar/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pausar/i })).toBeInTheDocument();
    });
    expect(remoteVoice.synthesizeRemoteArgentineVoice).toHaveBeenCalled();
    expect(localSpy).not.toHaveBeenCalled();
  });

  it('hides the missing-endpoint message while local Piper is idle', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(false);

    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);

    await waitFor(() => {
      expect(
        screen.getByText(/motores de voz en este dispositivo/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /preparar voz argentina/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/falta configurar el servicio remoto/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /usar voz argentina remota/i }),
    ).not.toBeInTheDocument();
  });

  it('explains missing remote endpoint only after local failure', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(false);
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockRejectedValue(
      new Error('fallo local'),
    );

    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    fireEvent.click(screen.getByRole('button', { name: /preparar voz argentina/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/falta configurar el servicio remoto/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /usar voz argentina remota/i }),
    ).not.toBeInTheDocument();
  });

  it('switching to remote cancels a local prepare and ignores a late local ready', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    let resolveLocal: ((blob: Blob) => void) | undefined;
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLocal = resolve;
        }),
    );

    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    fireEvent.click(screen.getByRole('button', { name: /preparar voz argentina/i }));
    expect(screen.getByText(/preparando voz argentina/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /acepto enviar sólo el texto del guion/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /usar voz argentina remota/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/estás usando la voz argentina remota/i),
      ).toBeInTheDocument();
    });

    resolveLocal?.(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/x-wav' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /reproducir voz argentina remota/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /^reproducir voz argentina$/i }),
    ).not.toBeInTheDocument();
  });
});
