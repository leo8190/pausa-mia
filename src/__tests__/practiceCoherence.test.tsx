import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createEmptyCheckIn, createInitialSession } from '../lib/session';
import {
  getPracticeConflicts,
  getPracticeSummary,
  getScriptCoherenceIssues,
  mentionsAvoidedTopic,
} from '../lib/practiceCoherence';
import { generateScript, validateScriptQuality } from '../lib/scriptEngine';
import {
  INTENTION_LABELS,
  STYLE_LABELS,
  type Intention,
  type MeditationStyle,
} from '../types';
import { CheckInStep } from '../components/CheckInStep';
import type { SessionApi } from '../hooks/useSession';

vi.mock('../components/TechnicalVoiceDetails', () => ({
  TechnicalVoiceDetails: () => null,
}));

const input = () => ({
  ...createEmptyCheckIn(),
  moment: 'ahora' as const,
  intention: 'concentrarse' as const,
  style: 'recorrido-corporal' as const,
  experience: 'basica' as const,
  perceivedState: 'tranquilo' as const,
});

describe('coherencia de la práctica', () => {
  it('permite las 20 combinaciones, en ambos acentos, cuatro momentos y tres duraciones (480 casos)', () => {
    for (const style of Object.keys(STYLE_LABELS) as MeditationStyle[]) {
      for (const intention of Object.keys(INTENTION_LABELS) as Intention[]) {
        for (const moment of [
          'ahora',
          'antes-de-dormir',
          'al-despertar',
          'pausa-laboral',
        ] as const) {
          for (const voiceVariant of ['es-AR', 'es-neutro'] as const) {
            for (const duration of [3, 5, 10] as const) {
              const checkIn = {
                ...input(),
                style,
                intention,
                moment,
                voiceVariant,
                duration,
              };
              expect(getPracticeConflicts(checkIn)).toEqual([]);
              const script = generateScript(checkIn, new Set(), {
                sessionProcessing: true,
              });
              expect(
                validateScriptQuality(script, { checkIn }).issues,
                `${style}/${intention}/${moment}/${voiceVariant}/${duration}`,
              ).toEqual([]);
              expect(script.fullText).not.toMatch(
                /más de lo cómodo|un minuto entero|lo único que está pasando de verdad/,
              );
              expect(getPracticeSummary(checkIn)).toContain(
                STYLE_LABELS[style].toLowerCase(),
              );
            }
          }
        }
      }
    }
  });

  it('señala elecciones que chocan con temas excluidos sin cambiar las selecciones', () => {
    const checkIn = {
      ...input(),
      style: 'respiracion-natural' as const,
      avoidTopics: 'respiración',
    };
    expect(getPracticeConflicts(checkIn)).toHaveLength(1);
    expect(() =>
      generateScript(checkIn, new Set(), { sessionProcessing: true }),
    ).toThrow(/Elegí otro estilo/);
    expect(checkIn.style).toBe('respiracion-natural');
    expect(getPracticeConflicts(checkIn, new Set(['avoidTopics']))).toEqual([]);
    expect(getPracticeConflicts({ ...input(), avoidTopics: 'CUERPO' })).toHaveLength(1);
    expect(
      getPracticeConflicts({
        ...input(),
        intention: 'aceptar-emocion',
        avoidTopics: 'emociones',
      }),
    ).toHaveLength(1);
  });

  it('omite frases completas, no corta palabras ni borra fragmentos de instrucciones', () => {
    expect(mentionsAvoidedTopic('La atención se nota.', 'no')).toBe(false);
    expect(mentionsAvoidedTopic('La respiración sigue.', 'respiracion')).toBe(true);
    const checkIn = { ...input(), avoidTopics: 'mandíbula', duration: 10 as const };
    const script = generateScript(checkIn, new Set(), { sessionProcessing: true });
    expect(script.fullText).not.toMatch(/mandíbula|soltar un poco la,/);
    expect(validateScriptQuality(script, { checkIn }).issues).toEqual([]);
  });

  it('protege también la salida de IA frente a las contradicciones conocidas', () => {
    const checkIn = {
      ...input(),
      moment: 'antes-de-dormir' as const,
      style: 'atencion-abierta' as const,
    };
    expect(
      getScriptCoherenceIssues(
        'Elegí un solo apoyo.',
        'Abrí los ojos y volvé al trabajo.',
        checkIn,
      ),
    ).toHaveLength(2);
    expect(
      getScriptCoherenceIssues('Quedate más de lo cómodo.', '', input()),
    ).toHaveLength(1);
    const script = generateScript(checkIn, new Set(), { sessionProcessing: true });
    expect(script.fullText).toContain('No hace falta mantenerte despierto');
    expect(script.fullText).toContain('Una atención amplia también concentra');
    expect(script.fullText).not.toMatch(/Eleg[iíe] un solo apoyo/);
  });

  it('no conserva una intención excluida en el título', () => {
    const script = generateScript(input(), new Set(['intention']), {
      sessionProcessing: true,
    });
    expect(script.intentionLabel).toBe('Pausa consciente');
    expect(script.title).not.toContain('Concentrarse');
  });

  it('explica la combinación y no deja avanzar con una contradicción explícita', () => {
    const checkIn = { ...input(), avoidTopics: 'cuerpo' };
    const sessionApi = {
      session: { ...createInitialSession(), checkIn },
      isCheckInComplete: true,
      updateCheckIn: vi.fn(),
      setStep: vi.fn(),
      deleteSession: vi.fn(),
    } as unknown as SessionApi;
    render(<CheckInStep sessionApi={sessionApi} />);
    expect(
      screen.getByText(/Tu pausa: Concentrarse con recorrido corporal/),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Pediste evitar el cuerpo/);
    expect(
      screen.getByRole('button', { name: 'Personalizar contexto y resumen' }),
    ).toBeDisabled();
  });
});
