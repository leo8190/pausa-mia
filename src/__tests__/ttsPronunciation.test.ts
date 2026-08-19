import { describe, expect, it } from 'vitest';
import {
  TTS_PRONUNCIATION_DICTIONARY,
  normalizeTextForTts,
} from '../lib/ttsPronunciation';

describe('ttsPronunciation', () => {
  it('includes a safe hint for ritmo without inventing extra words', () => {
    expect(TTS_PRONUNCIATION_DICTIONARY.ritmo).toBe('rit-mo');
    expect(TTS_PRONUNCIATION_DICTIONARY.ritmo).not.toMatch(/rhythm/i);
  });

  it('replaces ritmo in a script sentence for TTS only', () => {
    const source = 'Calmá el ritmo y volvé al cuerpo.';
    const spoken = normalizeTextForTts(source);
    expect(source).toContain('ritmo');
    expect(spoken).not.toBe(source);
    expect(spoken).toContain('rit-mo');
    expect(spoken).toContain('Calmá el');
    expect(spoken).toContain('y volvé al cuerpo.');
  });

  it('does not change unrelated words that only contain the letters of ritmo', () => {
    expect(normalizeTextForTts('El algoritmo sigue igual.')).toBe(
      'El algoritmo sigue igual.',
    );
  });

  it('preserves capitalization and is idempotent', () => {
    expect(normalizeTextForTts('Ritmo')).toBe('Rit-mo');
    expect(normalizeTextForTts('RITMO')).toBe('RIT-MO');
    const once = normalizeTextForTts('Un ritmo sereno.');
    expect(once).toBe('Un rit-mo sereno.');
    expect(normalizeTextForTts(once)).toBe(once);
  });

  it('leaves text without dictionary words unchanged', () => {
    const text = 'Cerrá los ojos y respirá.';
    expect(normalizeTextForTts(text)).toBe(text);
  });
});
