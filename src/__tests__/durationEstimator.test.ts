import { describe, expect, it } from 'vitest';
import {
  estimateMinutesFromSegments,
  isDurationWithinTolerance,
  DURATION_TOLERANCE_MINUTES,
  MEDITATION_WORDS_PER_MINUTE,
} from '../lib/durationEstimator';

describe('durationEstimator', () => {
  it('estimates minutes from words and pauses', () => {
    const segments = [
      {
        text: 'Una frase de prueba con varias palabras para meditar.',
        pauseAfterMs: 3000,
      },
      { text: 'Otra frase breve aquí.', pauseAfterMs: 5000 },
    ];
    const estimated = estimateMinutesFromSegments(segments);
    expect(estimated).toBeGreaterThan(0);
    expect(estimated).toBeLessThan(5);
  });

  it('documents tolerance of ±1 minute', () => {
    expect(DURATION_TOLERANCE_MINUTES).toBe(1);
    expect(isDurationWithinTolerance(4.5, 5)).toBe(true);
    expect(isDurationWithinTolerance(6.5, 5)).toBe(false);
  });

  it('uses meditation pace of ~100 wpm', () => {
    expect(MEDITATION_WORDS_PER_MINUTE).toBe(100);
  });
});
