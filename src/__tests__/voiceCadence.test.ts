import { describe, expect, it } from 'vitest';
import { SERENE_CADENCE_SCALE } from '../lib/piperEngine';
import {
  ARGENTINE_WEB_SPEECH_PITCH,
  ARGENTINE_WEB_SPEECH_RATE,
  CALM_SPEECH_RATE,
} from '../lib/voiceService';
import {
  ARGENTINE_PAUSE_SCALE,
  BASE_WEB_SPEECH_RATE,
  MEDITATION_LENGTH_SCALE,
  MEDITATION_SPEECH_RATE,
  REMOTE_ARGENTINE_PLAYBACK_RATE,
  resolvePiperLengthScale,
  scalePausesForArgentineDelivery,
} from '../lib/voiceCadence';

describe('voiceCadence', () => {
  it('reexports Piper serene cadence and multiplies length_scale', () => {
    expect(MEDITATION_LENGTH_SCALE).toBe(SERENE_CADENCE_SCALE);
    expect(MEDITATION_LENGTH_SCALE).toBeCloseTo(1.35, 2);
    expect(resolvePiperLengthScale(1)).toBeCloseTo(SERENE_CADENCE_SCALE, 5);
  });

  it('plays remote WAV at natural speed because its synthesis is already slowed', () => {
    expect(REMOTE_ARGENTINE_PLAYBACK_RATE).toBe(1);
  });

  it('reexports calm Web Speech rate near 0.72 for neutral', () => {
    expect(MEDITATION_SPEECH_RATE).toBe(CALM_SPEECH_RATE);
    expect(MEDITATION_SPEECH_RATE).toBeCloseTo(0.72, 2);
    expect(MEDITATION_SPEECH_RATE).toBeLessThan(BASE_WEB_SPEECH_RATE);
  });

  it('uses a slower Argentine Web Speech rate without lowering its natural pitch', () => {
    expect(ARGENTINE_WEB_SPEECH_RATE).toBeLessThan(CALM_SPEECH_RATE);
    expect(ARGENTINE_WEB_SPEECH_RATE).toBeGreaterThanOrEqual(0.7);
    expect(ARGENTINE_WEB_SPEECH_RATE).toBeLessThanOrEqual(0.75);
    expect(ARGENTINE_WEB_SPEECH_PITCH).toBe(1);
  });

  it('scales Argentine inter-phrase pauses without mutating the source', () => {
    const source = [
      { text: 'Primera.', pauseAfterMs: 1000 },
      { text: 'Segunda.', pauseAfterMs: 2000 },
    ];
    const scaled = scalePausesForArgentineDelivery(source);
    expect(ARGENTINE_PAUSE_SCALE).toBeCloseTo(1.12, 2);
    expect(scaled[0].pauseAfterMs).toBe(Math.round(1000 * ARGENTINE_PAUSE_SCALE));
    expect(scaled[1].pauseAfterMs).toBe(Math.round(2000 * ARGENTINE_PAUSE_SCALE));
    expect(source[0].pauseAfterMs).toBe(1000);
    expect(scaled[0].text).toBe('Primera.');
  });
});
