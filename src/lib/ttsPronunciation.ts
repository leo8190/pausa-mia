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

/**
 * Refuerza erres vibrantes para el fallback Web Speech (ruta argentina).
 * Piper ya fonemiza con espeak-ng: no usar esto en la ruta neuronal.
 *
 * - `rr` → `rrr` (empuja a vibrante múltiple en motores genéricos)
 * - `r` inicial de palabra → `rr` (evita que se trague la erre inicial)
 */
export function strengthenArgentineErresForWebSpeech(text: string): string {
  return text.replace(WORD_RE, (word) => {
    const parts: string[] = [];
    let i = 0;
    while (i < word.length) {
      const ch = word[i];
      const lower = ch.toLocaleLowerCase('es');
      if (lower === 'r') {
        const next = word[i + 1];
        const nextIsR = next !== undefined && next.toLocaleLowerCase('es') === 'r';
        if (nextIsR) {
          // rr → rrr (preservar mayúsculas del primer carácter)
          parts.push(ch === 'R' ? 'Rrr' : 'rrr');
          i += 2;
          continue;
        }
        if (i === 0) {
          // r inicial → rr
          parts.push(ch === 'R' ? 'Rr' : 'rr');
          i += 1;
          continue;
        }
      }
      parts.push(ch);
      i += 1;
    }
    return parts.join('');
  });
}

/**
 * Texto hablado para Web Speech en variante argentina: diccionario + erres.
 * No altera el guion visible en pantalla.
 */
export function normalizeTextForArgentineWebSpeech(text: string): string {
  return strengthenArgentineErresForWebSpeech(normalizeTextForTts(text));
}
