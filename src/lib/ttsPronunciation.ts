/**
 * Normalizador de pronunciación sólo para TTS.
 * El guion visible no se modifica: estas pistas se aplican al texto enviado
 * al sintetizador (Piper local, Web Speech o remoto).
 *
 * Diccionario pequeño y extensible: forma escrita → pista fonética segura.
 */

export const TTS_PRONUNCIATION_DICTIONARY: Readonly<Record<string, string>> = {
  // Evita que el sintetizador lea "ritmo" como el inglés "rhythm".
  ritmo: 'rit-mo',
  ritmos: 'rit-mos',
};

const WORD_RE = /[\p{L}\p{M}]+/gu;

function applyHintCasing(original: string, hint: string): string {
  if (original.length > 1 && original === original.toLocaleUpperCase('es')) {
    return hint.toLocaleUpperCase('es');
  }
  if (original[0] !== original[0].toLocaleLowerCase('es')) {
    return hint.charAt(0).toLocaleUpperCase('es') + hint.slice(1);
  }
  return hint;
}

/** Sustituye palabras del diccionario por su pista TTS. Idempotente. */
export function normalizeTextForTts(text: string): string {
  return text.replace(WORD_RE, (word) => {
    const hint = TTS_PRONUNCIATION_DICTIONARY[word.toLocaleLowerCase('es')];
    if (!hint) return word;
    return applyHintCasing(word, hint);
  });
}
