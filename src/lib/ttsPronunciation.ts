/** Keep native Spanish spelling. Invented spellings such as rit-mo, rrespirá
 * or cerrrá are not supported pronunciation controls and can distort words.
 * NFC handles accents consistently without changing the visible script. */
export function normalizeTextForTts(text: string): string {
  return text.normalize('NFC');
}
