import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import {
  cancelActiveSpeech,
  getRegisteredSpeechCancelCount,
  registerSpeechCancel,
} from '../lib/speechController';
import {
  PREFERENCES_KEY,
  clearPreferences,
  hasStoredPreferences,
  savePreferences,
} from '../lib/preferencesStorage';
import {
  clearSession,
  createBlankCheckIn,
  createInitialSession,
  isSessionEmpty,
} from '../lib/session';
import { useSession } from '../hooks/useSession';
import { useArgentineVoicePlayer } from '../hooks/useArgentineVoicePlayer';
import * as remoteVoice from '../lib/remoteVoiceService';
import App from '../App';
import { DeletedStep } from '../components/DeletedStep';

describe('speechController multi-cancel', () => {
  afterEach(() => {
    // Vaciar registros residuales invocando unregister de cada prueba.
    cancelActiveSpeech();
  });

  it('invoca todos los canceladores registrados, no sólo el último', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerSpeechCancel(first);
    const unregisterSecond = registerSpeechCancel(second);

    expect(getRegisteredSpeechCancelCount()).toBe(2);
    cancelActiveSpeech();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unregisterFirst();
    unregisterSecond();
    expect(getRegisteredSpeechCancelCount()).toBe(0);
  });

  it('sigue cancelando al resto si un cancelador lanza', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const u1 = registerSpeechCancel(bad);
    const u2 = registerSpeechCancel(good);

    expect(() => cancelActiveSpeech()).not.toThrow();
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();

    u1();
    u2();
  });
});

describe('clearSession wipe reliability', () => {
  beforeEach(() => {
    clearPreferences();
  });

  it('no rehidrata preferencias locales al vaciar la sesión', () => {
    savePreferences({
      duration: 10,
      voiceVariant: 'es-AR',
      style: 'atencion-abierta',
    });

    const cleared = clearSession();
    expect(cleared.checkIn).toEqual(createBlankCheckIn());
    expect(cleared.checkIn.duration).toBe(5);
    expect(cleared.checkIn.voiceVariant).toBe('es-neutro');
    expect(cleared.checkIn.style).toBe('');
    expect(cleared.script).toBeNull();
    expect(isSessionEmpty(cleared)).toBe(true);
  });
});

describe('useSession.deleteSession', () => {
  beforeEach(() => {
    clearPreferences();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aiEnabled: false }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPreferences();
  });

  it('borra la clave de preferencias y deja la sesión vacía en paso deleted', async () => {
    const cancelSpy = vi.fn();
    const unregister = registerSpeechCancel(cancelSpy);

    savePreferences({
      duration: 10,
      voiceVariant: 'es-AR',
      style: 'autocompasion',
    });
    expect(localStorage.getItem(PREFERENCES_KEY)).not.toBeNull();

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    act(() => {
      result.current.updateConsent({ sessionProcessing: true, savePreferences: true });
      result.current.updateCheckIn({
        name: 'Ana',
        moment: 'ahora',
        recentSituation: 'Día largo con reuniones',
        perceivedState: 'cansado',
        intention: 'descansar',
        experience: 'basica',
        style: 'respiracion-natural',
      });
      result.current.updateContextSources([
        {
          id: 'diary-1',
          type: 'manual-diary',
          label: 'Diario',
          content: 'Hoy me sentí agotada',
          selected: true,
        },
      ]);
    });

    act(() => {
      result.current.deleteSession();
    });

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
    expect(hasStoredPreferences()).toBe(false);
    expect(result.current.session.step).toBe('deleted');
    expect(result.current.session.script).toBeNull();
    expect(result.current.session.checkIn.name).toBe('');
    expect(result.current.session.checkIn.recentSituation).toBe('');
    expect(result.current.session.contextSources.every((s) => !s.content.trim())).toBe(
      true,
    );
    expect(result.current.isSessionEmpty).toBe(true);

    unregister();
  });
});

describe('DeletedStep visual confirmation', () => {
  it('muestra confirmación explícita cuando la sesión está vacía y sin preferencias', () => {
    clearPreferences();
    const sessionApi = {
      session: { ...createInitialSession(), step: 'deleted' as const },
      isSessionEmpty: true,
      resetToWelcome: vi.fn(),
    } as unknown as ReturnType<typeof useSession>;

    render(<DeletedStep sessionApi={sessionApi} />);

    expect(screen.getByTestId('wipe-confirmation')).toBeInTheDocument();
    expect(screen.getByText(/borrado confirmado/i)).toBeInTheDocument();
    expect(screen.getByText(/estado de sesión vacío/i)).toBeInTheDocument();
    expect(screen.getByText(/preferencias locales borradas/i)).toBeInTheDocument();
    expect(screen.getByText(/audio en curso cancelado/i)).toBeInTheDocument();
    expect(screen.queryByText(/día largo/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /^revisión$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/situación reciente/i)).not.toBeInTheDocument();
  });
});

describe('App wipe flow leaves no check-in/script/diary on screen', () => {
  beforeEach(() => {
    clearPreferences();
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
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearPreferences();
  });

  it('tras confirmar el borrado muestra la pantalla de confirmación sin restos', async () => {
    render(<App />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /personalizar check-in/i }));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /permito usar mis respuestas de esta sesión únicamente/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /continuar al check-in/i }));

    fireEvent.click(screen.getByLabelText(/ahora, en este momento/i));
    fireEvent.click(screen.getByLabelText(/^acelerado$/i));
    fireEvent.click(screen.getByLabelText(/calmar el ritmo/i));
    fireEvent.click(screen.getByLabelText(/experiencia básica/i));
    fireEvent.click(screen.getByLabelText(/respiración natural/i));

    const situation = screen.getByLabelText(/situación reciente/i);
    fireEvent.change(situation, {
      target: { value: 'Tuve varias reuniones seguidas y todavía me quedan tareas' },
    });

    fireEvent.click(screen.getByRole('button', { name: /borrar esta sesión/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sí, borrar sesión/i }));

    expect(
      screen.getByRole('heading', { name: /sesión borrada/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('wipe-confirmation')).toBeInTheDocument();
    expect(screen.getByText(/borrado confirmado/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Tuve varias reuniones seguidas/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/situación reciente/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });
});

describe('wipe cancels shared Argentine HTMLAudioElement', () => {
  beforeEach(() => {
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
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:wipe-audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancelActiveSpeech pausa y desarma el mismo Audio de la sesión (#19)', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'assertRemoteSessionTextLimits').mockImplementation(() => {});
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    );

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      result.current.play([{ text: 'Respirá con calma.', pauseAfterMs: 5 }]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
    });

    const pauseSpy = window.HTMLMediaElement.prototype.pause as ReturnType<
      typeof vi.fn
    >;
    const pauseCallsBefore = pauseSpy.mock.calls.length;

    act(() => {
      cancelActiveSpeech();
    });

    expect(pauseSpy.mock.calls.length).toBeGreaterThan(pauseCallsBefore);
    expect(result.current.state.status).toBe('stopped');
    expect(result.current.state.nativeAudioUrl).toBeNull();
  });
});
