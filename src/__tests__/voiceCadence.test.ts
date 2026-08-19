import { describe, expect, it } from 'vitest';
import { SERENE_CADENCE_SCALE } from '../lib/piperEngine';
import { CALM_SPEECH_RATE } from '../lib/voiceService';
import {
  BASE_WEB_SPEECH_RATE,
  MEDITATION_LENGTH_SCALE,
  MEDITATION_SPEECH_RATE,
  resolvePiperLengthScale,
} from '../lib/voiceCadence';

describe('voiceCadence', () => {
  it('reexports Piper serene cadence and multiplies length_scale', () => {
    expect(MEDITATION_LENGTH_SCALE).toBe(SERENE_CADENCE_SCALE);
    expect(MEDITATION_LENGTH_SCALE).toBeGreaterThanOrEqual(1.15);
    expect(MEDITATION_LENGTH_SCALE).toBeLessThanOrEqual(1.2);
    expect(resolvePiperLengthScale(1)).toBeCloseTo(SERENE_CADENCE_SCALE, 5);
  });

  it('reexports calm Web Speech rate near 0.80', () => {
    expect(MEDITATION_SPEECH_RATE).toBe(CALM_SPEECH_RATE);
    expect(MEDITATION_SPEECH_RATE).toBeCloseTo(0.8, 2);
    expect(MEDITATION_SPEECH_RATE).toBeLessThan(BASE_WEB_SPEECH_RATE);
  });
});
