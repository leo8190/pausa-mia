import { describe, expect, it } from 'vitest';
import { normalizeTextForTts } from '../lib/ttsPronunciation';

describe('Spanish pronunciation input', () => {
  it.each([
    'No hace falta hacerlo perfecto.',
    'Respirá a tu ritmo y volvé al cuerpo.',
    'Recordá recorrer el cuerpo sin apurarte.',
    'Caro, carro, pero, perro, alrededor, RITMO.',
  ])('preserves ordinary spelling and consonant distinctions: %s', (text) => {
    expect(normalizeTextForTts(text)).toBe(text);
  });

  it('normalizes decomposed accents without changing words or applying twice', () => {
    const text = 'Respira\u0301.';
    expect(normalizeTextForTts(text)).toBe('Respirá.');
    expect(normalizeTextForTts(normalizeTextForTts(text))).toBe('Respirá.');
  });
});
