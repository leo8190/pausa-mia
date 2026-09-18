import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaybackStep } from '../components/PlaybackStep';
import type { SessionApi } from '../hooks/useSession';
import type { SessionState } from '../types';
import { REMOTE_WARMUP_TEXT } from '../hooks/useArgentineVoicePlayer';
import * as voiceEngine from '../lib/voiceEngine';
import * as remoteVoice from '../lib/remoteVoiceService';

function makeSessionApi(
  voiceVariant: 'es-AR' | 'es-neutro',
  overrides: Partial<SessionApi['session']> = {},
): SessionApi {
  const session = {
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
    autoStartPlayback: false,
    ...overrides,
  } as unknown as SessionState;
  return {
    session,
    setStep: vi.fn(),
    deleteSession: vi.fn(),
    clearAutoStartPlayback: vi.fn(() => {
      session.autoStartPlayback = false;
    }),
  } as unknown as SessionApi;
}

const audioBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });

function mockDeviceVoiceAvailable(): void {
  vi.spyOn(window.speechSynthesis, 'getVoices').mockReturnValue([
    { name: 'Voz de prueba', lang: 'es-ES' } as SpeechSynthesisVoice,
  ]);
}

function configureOnlineHelp(): void {
  vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
  vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
}

function acceptOnlineHelp(): void {
  fireEvent.click(screen.getByRole('checkbox', { name: /acepto enviar el guion/i }));
  fireEvent.click(screen.getByRole('button', { name: /preparar audio por internet/i }));
}

async function prepareLocalAudio(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /^preparar audio$/i }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeInTheDocument(),
  );
}

describe('PlaybackStep — voz sencilla y consentimiento', () => {
  beforeEach(() => {
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
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    voiceEngine.resetNeuralVoiceVerificationForTests();
    voiceEngine.resetArgentineVoiceSessionForTests();
  });

  it('offers one preparation action without engine choices or diagnostics even when online help exists', () => {
    configureOnlineHelp();
    const remoteSpy = vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice');
    const { container } = render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    expect(
      screen.getByRole('button', { name: /^preparar audio$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^reproducir$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /voz (local|remota)|motores de voz|información técnica|compatibilidad de este|endpoint|Web Speech|neuronal/i,
    );
    expect(remoteSpy).not.toHaveBeenCalled();
  });

  it('Empezar ahora prepares and plays once without sending text online', async () => {
    configureOnlineHelp();
    const remoteSpy = vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice');
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(audioBlob());
    const sessionApi = makeSessionApi('es-AR', { autoStartPlayback: true });
    render(<PlaybackStep sessionApi={sessionApi} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^pausar$/i })).toBeInTheDocument(),
    );
    expect(sessionApi.clearAutoStartPlayback).toHaveBeenCalledTimes(1);
    expect(remoteSpy).not.toHaveBeenCalled();
    expect(synthesis).toHaveBeenCalledTimes(1);
    expect(synthesis.mock.calls[0][0]).toBe('Cerrá los ojos y respirá.');
  });

  it('does not play manually prepared audio until Reproducir is pressed', async () => {
    const playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const synthesis = vi
      .spyOn(voiceEngine, 'synthesizeArgentineVoice')
      .mockResolvedValue(audioBlob());
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    await prepareLocalAudio();
    expect(playSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^reproducir$/i }));
    await waitFor(() => expect(playSpy).toHaveBeenCalled());
    expect(synthesis).toHaveBeenCalledTimes(1);
    expect(synthesis.mock.calls[0][0]).toBe('Cerrá los ojos y respirá.');
  });

  it.each(['es-AR', 'es-neutro'] as const)(
    'keeps playback free of fragment counts and audio-file actions (%s)',
    async (variant) => {
      mockDeviceVoiceAvailable();
      vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockResolvedValue(audioBlob());
      const { container } = render(
        <PlaybackStep sessionApi={makeSessionApi(variant)} />,
      );
      if (variant === 'es-AR') await prepareLocalAudio();
      expect(
        screen.queryByRole('button', { name: /^reiniciar$/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /terminar mi pausa/i }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^reproducir$/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^pausar$/i })).toBeInTheDocument(),
      );
      expect(container.textContent).not.toMatch(
        /\d+ de \d+|descargar|segmento actual|guardar este audio|abrir audio/i,
      );
      expect(container.querySelector('a[download]')).toBeNull();
      expect(screen.getByRole('button', { name: /^detener$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^reiniciar$/i })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /terminar mi pausa/i }),
      ).toBeInTheDocument();
      const script = screen.getByText('Cerrá los ojos y respirá.');
      expect(script).not.toBeVisible();
      fireEvent.click(screen.getByText('Leer la meditación'));
      expect(script).toBeVisible();
    },
  );

  it.each(['es-AR', 'es-neutro'] as const)(
    'allows editing the practice before starting playback (%s)',
    (variant) => {
      mockDeviceVoiceAvailable();
      const sessionApi = makeSessionApi(variant);
      render(<PlaybackStep sessionApi={sessionApi} />);
      fireEvent.click(screen.getByRole('button', { name: /editar mi pausa/i }));
      expect(sessionApi.setStep).toHaveBeenCalledWith('checkin');
    },
  );

  it('keeps the iPhone audio control usable without downloads or duplicate play buttons', async () => {
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockResolvedValue(audioBlob());
    window.HTMLMediaElement.prototype.play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValue(undefined);
    const { container } = render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    await prepareLocalAudio();
    fireEvent.click(screen.getByRole('button', { name: /^reproducir$/i }));
    await waitFor(() => expect(container.querySelector('audio')).toBeInTheDocument());
    expect(container.querySelector('audio')).toHaveAttribute(
      'controlslist',
      'nodownload noplaybackrate',
    );
    expect(container.querySelector('audio')).toHaveAccessibleName(
      'Audio de tu meditación',
    );
    expect(container.querySelector('a[download]')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^reproducir$/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^reproducir$/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^pausar$/i })).toBeInTheDocument(),
    );
  });

  it('shows a simple error and requires an explicit choice before changing the voice', async () => {
    mockDeviceVoiceAvailable();
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockRejectedValue(
      new Error('ONNX stack internal 123'),
    );
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    fireEvent.click(screen.getByRole('button', { name: /^preparar audio$/i }));
    await waitFor(() =>
      expect(screen.getByText(/no pudimos preparar o reproducir/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/ONNX/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^reproducir$/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /escuchar con otra voz/i }));
    expect(screen.getByText(/elegiste otra voz/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeInTheDocument();
  });

  it('plays the neutral choice directly without engine diagnostics', () => {
    const { container } = render(
      <PlaybackStep sessionApi={makeSessionApi('es-neutro')} />,
    );
    expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^preparar audio$/i }),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /motores de voz|información técnica|Web Speech/,
    );
  });

  it('shows a clear notice when the device voice fails without skipping the phrase', () => {
    mockDeviceVoiceAvailable();
    let utterance!: SpeechSynthesisUtterance;
    const speak = vi
      .spyOn(window.speechSynthesis, 'speak')
      .mockImplementation((next) => {
        utterance = next;
      });
    render(<PlaybackStep sessionApi={makeSessionApi('es-neutro')} />);
    fireEvent.click(screen.getByRole('button', { name: /^reproducir$/i }));
    act(() => {
      utterance.onerror?.call(utterance, {} as SpeechSynthesisErrorEvent);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/el audio se interrumpió/i);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeInTheDocument();
  });

  it('offers online help only after local failure and sends nothing before consent', async () => {
    configureOnlineHelp();
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockRejectedValue(
      new Error('fallo local'),
    );
    const remoteSpy = vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice');
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^preparar audio$/i }));
    const remoteButton = await screen.findByRole('button', {
      name: /preparar audio por internet/i,
    });
    expect(remoteButton).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(remoteButton);
    expect(remoteSpy).not.toHaveBeenCalled();
    expect(
      screen.getByText(/guion puede incluir detalles personales/i),
    ).toBeInTheDocument();
  });

  it('requires consent on unsupported devices, then preserves playback controls', async () => {
    configureOnlineHelp();
    vi.spyOn(voiceEngine, 'checkNeuralEngineBrowserSupport').mockReturnValue(false);
    const localSpy = vi.spyOn(voiceEngine, 'synthesizeArgentineVoice');
    const remoteSpy = vi
      .spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice')
      .mockResolvedValue(audioBlob());
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    expect(
      screen.getByRole('button', { name: /preparar audio por internet/i }),
    ).toBeDisabled();
    expect(remoteSpy).not.toHaveBeenCalled();
    acceptOnlineHelp();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeInTheDocument(),
    );
    expect(remoteSpy).toHaveBeenNthCalledWith(
      1,
      REMOTE_WARMUP_TEXT,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^reproducir$/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^pausar$/i })).toBeInTheDocument(),
    );
    expect(remoteSpy).toHaveBeenNthCalledWith(
      2,
      'Cerrá los ojos y respirá.',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^pausar$/i }));
    expect(screen.getByRole('button', { name: /^continuar$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^detener$/i }));
    expect(screen.getByText(/detenido/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^reiniciar$/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^pausar$/i })).toBeInTheDocument(),
    );
    expect(localSpy).not.toHaveBeenCalled();
  });

  it('revoking permission cancels the request and discards a late online result', async () => {
    configureOnlineHelp();
    vi.spyOn(voiceEngine, 'checkNeuralEngineBrowserSupport').mockReturnValue(false);
    let resolveOnline: ((blob: Blob) => void) | undefined;
    const remoteSpy = vi
      .spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOnline = resolve;
          }),
      );
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    acceptOnlineHelp();
    await waitFor(() => expect(remoteSpy).toHaveBeenCalledOnce());
    const signal = remoteSpy.mock.calls[0][1]?.signal;
    fireEvent.click(screen.getByText('Privacidad del audio'));
    fireEvent.click(screen.getByRole('button', { name: /retirar permiso/i }));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: /preparar audio por internet/i }),
    ).toBeDisabled();
    await act(async () => {
      resolveOnline?.(audioBlob());
    });
    expect(
      screen.queryByRole('button', { name: /^reproducir$/i }),
    ).not.toBeInTheDocument();
    expect(remoteSpy).toHaveBeenCalledOnce();
  });

  it('asks again for online permission when the script changes', async () => {
    configureOnlineHelp();
    vi.spyOn(voiceEngine, 'checkNeuralEngineBrowserSupport').mockReturnValue(false);
    const remoteSpy = vi
      .spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice')
      .mockResolvedValue(audioBlob());
    const { rerender } = render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    acceptOnlineHelp();
    await screen.findByRole('button', { name: /^reproducir$/i });
    rerender(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
    expect(
      screen.getByRole('button', { name: /preparar audio por internet/i }),
    ).toBeDisabled();
    expect(remoteSpy).toHaveBeenCalledOnce();
  });

  it('does not expose configuration errors when the online service is absent', async () => {
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockRejectedValue(
      new Error('fallo local'),
    );
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    fireEvent.click(screen.getByRole('button', { name: /^preparar audio$/i }));
    await screen.findByText(/no pudimos preparar o reproducir/i);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/endpoint|configurar|remoto/i)).not.toBeInTheDocument();
  });

  it('does not offer online audio when playback is unsupported', () => {
    mockDeviceVoiceAvailable();
    configureOnlineHelp();
    vi.spyOn(voiceEngine, 'checkNeuralEngineBrowserSupport').mockReturnValue(false);
    vi.spyOn(voiceEngine, 'checkRemoteWavPlaybackSupport').mockReturnValue(false);
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /escuchar con otra voz/i }),
    ).toBeInTheDocument();
  });

  it('offers reading when no compatible player exists', () => {
    vi.spyOn(voiceEngine, 'checkNeuralEngineBrowserSupport').mockReturnValue(false);
    vi.spyOn(voiceEngine, 'checkRemoteWavPlaybackSupport').mockReturnValue(false);
    vi.spyOn(voiceEngine, 'checkWebSpeechEngineSupport').mockReturnValue(false);
    render(<PlaybackStep sessionApi={makeSessionApi('es-AR')} />);
    expect(
      screen.getByText(/por ahora no podemos reproducir audio acá/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /escuchar con otra voz/i }),
    ).not.toBeInTheDocument();
  });

  it('offers reading when neutral audio is unavailable', () => {
    vi.spyOn(voiceEngine, 'checkWebSpeechEngineSupport').mockReturnValue(false);
    const sessionApi = makeSessionApi('es-neutro');
    render(<PlaybackStep sessionApi={sessionApi} />);
    expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /leer el guion/i }));
    expect(sessionApi.setStep).toHaveBeenCalledWith('review');
  });

  it('keeps mobile audio controls and a simple prompt when autoplay is blocked', async () => {
    vi.spyOn(voiceEngine, 'synthesizeArgentineVoice').mockResolvedValue(audioBlob());
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new DOMException('gesture needed', 'NotAllowedError'),
    );
    render(
      <PlaybackStep
        sessionApi={makeSessionApi('es-AR', { autoStartPlayback: true })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/tocá reproducir para empezar/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^reproducir$/i })).toBeInTheDocument();
    expect(document.querySelector('audio[controls]')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /guardar este audio/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
