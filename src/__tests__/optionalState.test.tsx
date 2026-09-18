import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import App from '../App';
import { useSession } from '../hooks/useSession';
import {
  applyStartNowDefaults,
  createBlankCheckIn,
  isCheckInComplete,
} from '../lib/session';
import { generateScript, validateScriptQuality } from '../lib/scriptEngine';
import {
  buildAiTransmissionData,
  serializeAiTransmissionPayload,
} from '../lib/aiTransmissionPayload';
import { AiScriptProvider } from '../lib/scriptProvider';
import {
  INTENTION_LABELS,
  STYLE_LABELS,
  type CheckInData,
  type Intention,
  type MeditationStyle,
} from '../types';

function minimalCheckIn(): CheckInData {
  return {
    ...createBlankCheckIn(),
    moment: 'ahora',
    intention: 'descansar',
    experience: 'basica',
    style: 'atencion-abierta',
  };
}

async function openCheckIn() {
  render(<App />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
  fireEvent.click(
    screen.getByRole('checkbox', { name: /permito usar mis respuestas/i }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^continuar$/i }));
  fireEvent.click(screen.getByLabelText(/ahora, en este momento/i));
  fireEvent.click(screen.getByLabelText(/^descansar$/i));
  fireEvent.click(screen.getByLabelText(/experiencia básica/i));
  fireEvent.click(screen.getByLabelText(/atención abierta/i));
}

describe('estado personal opcional', () => {
  beforeEach(() => {
    localStorage.clear();
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('does not require or invent a personal state', () => {
    const checkIn = minimalCheckIn();
    expect(isCheckInComplete(checkIn)).toBe(true);
    expect(applyStartNowDefaults(checkIn).perceivedState).toBe('');
  });

  it.each(['moment', 'intention', 'experience', 'style'] as const)(
    'still requires the practice choice %s',
    (field) => {
      expect(isCheckInComplete({ ...minimalCheckIn(), [field]: '' })).toBe(false);
    },
  );

  it.each(['rápido', 'con resumen'] as const)(
    'completes the %s path without sharing a state',
    async (path) => {
      await openCheckIn();
      expect(
        screen.getByRole('group', { name: /cómo te sentís.*opcional/i }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/prefiero no responder/i)).toBeChecked();
      expect(screen.getByRole('button', { name: /empezar ahora/i })).toBeEnabled();
      if (path === 'con resumen') {
        fireEvent.click(
          screen.getByRole('button', { name: /personalizar un poco más/i }),
        );
        fireEvent.click(screen.getByRole('button', { name: /continuar al resumen/i }));
        expect(screen.queryByText('Estado percibido')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /generar guion/i }));
        await screen.findByRole('heading', { name: /^tu meditación$/i });
        fireEvent.click(screen.getByRole('button', { name: /reproducir audio/i }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: /empezar ahora/i }));
      }
      await screen.findByRole('heading', { name: /^reproducción$/i });
      const script = screen.getByRole('region', {
        name: /guion en reproducción/i,
        hidden: true,
      });
      expect(script.textContent).not.toMatch(/lleg[aá]s con algo de calma ya puesta/i);
      fireEvent.click(screen.getByRole('button', { name: /editar mi pausa/i }));
      expect(screen.getByLabelText(/prefiero no responder/i)).toBeChecked();
    },
  );

  it('lets a person remove a previously entered state and its free text', async () => {
    await openCheckIn();
    fireEvent.click(screen.getByLabelText(/^otro$/i));
    fireEvent.change(screen.getByLabelText(/descripción del estado percibido/i), {
      target: { value: 'CENTINELA_ESTADO_PRIVADO' },
    });
    fireEvent.click(screen.getByLabelText(/prefiero no responder/i));
    expect(
      screen.queryByLabelText(/descripción del estado percibido/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^otro$/i));
    expect(screen.getByLabelText(/descripción del estado percibido/i)).toHaveValue('');
  });

  it.each(['', 'tranquilo'] as const)(
    'clears hidden free text when changing Otro to %s',
    async (state) => {
      const { result } = renderHook(() => useSession());
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      act(() =>
        result.current.updateCheckIn({
          perceivedState: 'otro',
          perceivedStateOther: 'CENTINELA_ESTADO_PRIVADO',
        }),
      );
      act(() => result.current.updateCheckIn({ perceivedState: state }));
      expect(result.current.session.checkIn.perceivedStateOther).toBe('');
      const body = serializeAiTransmissionPayload(
        buildAiTransmissionData(result.current.session.checkIn, new Set(), []),
      );
      expect(body).not.toContain('CENTINELA_ESTADO_PRIVADO');
      if (state === '') expect(body).not.toContain('Estado percibido');
    },
  );

  it('preserves both consent and safety checks when the state is omitted', async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    act(() => result.current.updateCheckIn(minimalCheckIn()));
    act(() => expect(result.current.startNow()).toBe(false));
    expect(result.current.session.script).toBeNull();
    act(() => {
      result.current.updateConsent({ sessionProcessing: true });
      result.current.updateCheckIn({ recentSituation: 'quiero suicidarme' });
    });
    act(() => expect(result.current.startNow()).toBe(false));
    expect(result.current.session.step).toBe('safety');
    expect(result.current.session.script).toBeNull();
  });

  it('does not keep processing a discarded Otro description', async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    act(() => {
      result.current.updateConsent({ sessionProcessing: true });
      result.current.updateCheckIn({
        ...minimalCheckIn(),
        perceivedState: 'otro',
        perceivedStateOther: 'quiero suicidarme',
      });
    });
    act(() => result.current.updateCheckIn({ perceivedState: '' }));
    act(() => expect(result.current.startNow()).toBe(true));
    expect(result.current.session.step).toBe('playback');
    expect(result.current.session.checkIn.perceivedStateOther).toBe('');
    expect(result.current.session.script?.usedDetails).not.toContain('perceivedState');
  });

  it('rejects an excluded state and does not count a repeated detail twice', () => {
    const checkIn = { ...minimalCheckIn(), perceivedState: 'tranquilo' as const };
    const script = generateScript(checkIn, new Set(), { sessionProcessing: true });
    expect(validateScriptQuality(script, { checkIn }).valid).toBe(true);
    expect(
      validateScriptQuality(script, {
        checkIn,
        excluded: new Set(['perceivedState']),
      }).valid,
    ).toBe(false);
    expect(
      validateScriptQuality(
        { ...script, usedDetails: ['moment', 'moment'] },
        { checkIn },
      ).valid,
    ).toBe(false);
  });

  it('retains useful personalization across 120 practices without a state', () => {
    for (const style of Object.keys(STYLE_LABELS) as MeditationStyle[]) {
      for (const intention of Object.keys(INTENTION_LABELS) as Intention[]) {
        for (const voiceVariant of ['es-AR', 'es-neutro'] as const) {
          for (const duration of [3, 5, 10] as const) {
            const checkIn = {
              ...minimalCheckIn(),
              style,
              intention,
              voiceVariant,
              duration,
            };
            const script = generateScript(checkIn, new Set(), {
              sessionProcessing: true,
            });
            expect(validateScriptQuality(script, { checkIn }).issues).toEqual([]);
            expect(new Set(script.usedDetails).size).toBeGreaterThanOrEqual(2);
            expect(script.usedDetails).not.toContain('perceivedState');
            expect(script.fullText).not.toMatch(
              /lleg[aá]s con algo de calma ya puesta/i,
            );
          }
        }
      }
    }
  });

  it('rejects an AI response that claims to use an omitted state and falls back safely', async () => {
    const checkIn = minimalCheckIn();
    const localScript = generateScript(checkIn, new Set(), { sessionProcessing: true });
    const invented = {
      ...localScript,
      usedDetails: [...localScript.usedDetails, 'perceivedState'],
      engine: 'ai' as const,
    };
    expect(validateScriptQuality(invented, { checkIn }).valid).toBe(false);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ script: invented }),
    } as Response);
    const result = await new AiScriptProvider().generate({
      checkIn,
      excluded: new Set(),
      sessionProcessing: true,
      aiTransmission: true,
      contextSources: [],
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.script.usedDetails).not.toContain('perceivedState');
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(
      sent.payload.personal.some(
        (field: { label: string }) => field.label === 'Estado percibido',
      ),
    ).toBe(false);
  });
});
