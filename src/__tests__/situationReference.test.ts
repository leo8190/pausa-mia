import { describe, expect, it } from 'vitest';
import { buildSituationRecognitionPhrase } from '../lib/situationReference';

describe('situationReference', () => {
  it('builds categorical recognition phrase without user text', () => {
    const phraseAr = buildSituationRecognitionPhrase('es-AR');
    const phraseNeutro = buildSituationRecognitionPhrase('es-neutro');

    expect(phraseAr).not.toContain('relacionado con');
    expect(phraseNeutro).not.toContain('relacionado con');
    expect(phraseAr).toMatch(/situación reciente/i);
    expect(phraseAr).toMatch(/no hace falta nombrarla/i);
    expect(phraseNeutro).toMatch(/no hace falta nombrarla/i);
  });
});
