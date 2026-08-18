import type { Duration, ScriptSegment } from '../types';

/** Ritmo de narración lenta para meditación: ~100 palabras por minuto */
export const MEDITATION_WORDS_PER_MINUTE = 100;

/** Tolerancia documentada respecto a la duración elegida (± minutos) */
export const DURATION_TOLERANCE_MINUTES = 1;

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function estimateMinutesFromSegments(segments: ScriptSegment[]): number {
  const totalWords = segments.reduce((sum, seg) => sum + countWords(seg.text), 0);
  const speechMinutes = totalWords / MEDITATION_WORDS_PER_MINUTE;
  const pauseMinutes = segments.reduce((sum, seg) => sum + seg.pauseAfterMs, 0) / 60000;
  const raw = speechMinutes + pauseMinutes;
  return Math.max(1, Math.round(raw * 10) / 10);
}

export function isDurationWithinTolerance(
  estimated: number,
  target: Duration,
): boolean {
  return Math.abs(estimated - target) <= DURATION_TOLERANCE_MINUTES;
}
