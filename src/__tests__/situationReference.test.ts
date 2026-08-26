import { describe, expect, it } from 'vitest';
import { buildSituationRecognitionPhrase } from '../lib/situationReference';

describe('situationReference', () => {
  it('builds categorical recognition phrase without user text', () => {
    const phraseAr = buildSituationRecognitionPhrase('es-AR');
    const phraseNeutro = buildSituationRecognitionPhrase('es-neutro');

    expect(phraseAr).not.toContain('relacionado con');
    expect(phraseNeutro).not.toContain('relacionado con');
    expect(phraseAr).toBe(
      'Traés una situación reciente que elegiste tener en cuenta. No hace falta nombrarla ni resolverla durante esta pausa.',
    );
    expect(phraseNeutro).toBe(
      'Traes una situación reciente que elegiste tener en cuenta. No hace falta nombrarla ni resolverla durante esta pausa.',
    );
  });
});
