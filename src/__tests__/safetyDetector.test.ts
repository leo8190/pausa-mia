import { describe, expect, it } from 'vitest';
import {
  detectImmediateDanger,
  scanCheckInForDanger,
  SAFETY_ACTIONS,
  ARGENTINA_CRISIS_LINE,
  ARGENTINA_CRISIS_LINE_URL,
} from '../lib/safetyDetector';

describe('safetyDetector', () => {
  it('does not trigger on neutral text', () => {
    const result = detectImmediateDanger('Hoy tuve un día largo en el trabajo');
    expect(result.triggered).toBe(false);
  });

  it('triggers on suicide-related phrases', () => {
    expect(detectImmediateDanger('quiero suicidarme').triggered).toBe(true);
    expect(detectImmediateDanger('no quiero vivir').triggered).toBe(true);
    expect(detectImmediateDanger('me voy a matar').triggered).toBe(true);
  });

  it('triggers on self-harm phrases', () => {
    expect(detectImmediateDanger('quiero hacerme daño').triggered).toBe(true);
    expect(detectImmediateDanger('autolesionarme').triggered).toBe(true);
  });

  it('does not trigger on mild distress without danger', () => {
    expect(detectImmediateDanger('estoy muy cansado y estresado').triggered).toBe(
      false,
    );
    expect(detectImmediateDanger('me siento triste hoy').triggered).toBe(false);
  });

  it('scans combined check-in fields', () => {
    const result = scanCheckInForDanger({
      recentSituation: 'quiero morir',
      perceivedStateOther: '',
      avoidTopics: '',
      name: '',
    });
    expect(result.triggered).toBe(true);
  });

  it('is conservative — does not attempt diagnosis', () => {
    const result = detectImmediateDanger('tengo ansiedad');
    expect(result.triggered).toBe(false);
  });

  it('shows Argentina official crisis line 0800-999-0091, not 141 or 107', () => {
    const combined = SAFETY_ACTIONS.join(' ');
    expect(combined).toContain(ARGENTINA_CRISIS_LINE);
    expect(combined).not.toContain('141');
    expect(combined).not.toContain('107');
    expect(combined).toContain('911');
  });

  it('references official Argentina government source URL', () => {
    expect(ARGENTINA_CRISIS_LINE_URL).toBe('https://www.argentina.gob.ar/node/492429');
  });
});
