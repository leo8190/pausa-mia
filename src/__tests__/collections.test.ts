import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS,
  RAPIDA_1_MIN,
  collectionCheckInFields,
  type CollectionPreset,
} from '../lib/collections';
import { getPracticeConflicts } from '../lib/practiceCoherence';
import { createEmptyCheckIn, isCheckInComplete } from '../lib/session';
import {
  EXPERIENCE_LABELS,
  INTENTION_LABELS,
  MOMENT_LABELS,
  STYLE_LABELS,
  type Duration,
} from '../types';

const DURATIONS: Duration[] = [1, 3, 5, 10];

function assertValidPreset(preset: CollectionPreset) {
  expect(preset.id).toMatch(/^[a-z0-9-]+$/);
  expect(preset.title.trim().length).toBeGreaterThan(0);
  expect(preset.hint.trim().length).toBeGreaterThan(0);
  expect(DURATIONS).toContain(preset.duration);
  expect(Object.keys(STYLE_LABELS)).toContain(preset.style);
  expect(Object.keys(EXPERIENCE_LABELS)).toContain(preset.experience);
  expect(Object.keys(INTENTION_LABELS)).toContain(preset.intention);
  expect(Object.keys(MOMENT_LABELS)).toContain(preset.moment);
}

describe('Colecciones', () => {
  it('expone 5 o 6 presets con ids únicos y forma válida', () => {
    expect(COLLECTIONS.length).toBeGreaterThanOrEqual(5);
    expect(COLLECTIONS.length).toBeLessThanOrEqual(6);
    const ids = COLLECTIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of COLLECTIONS) {
      assertValidPreset(preset);
    }
  });

  it('incluye el atajo de 1 min con campos completos', () => {
    assertValidPreset(RAPIDA_1_MIN);
    expect(RAPIDA_1_MIN.duration).toBe(1);
    expect(COLLECTIONS.some((c) => c.id === RAPIDA_1_MIN.id)).toBe(false);
  });

  it('al aplicar cada colección el check-in queda completo y sin conflictos de práctica', () => {
    for (const preset of [...COLLECTIONS, RAPIDA_1_MIN]) {
      const checkIn = {
        ...createEmptyCheckIn(),
        ...collectionCheckInFields(preset),
      };
      expect(isCheckInComplete(checkIn), preset.id).toBe(true);
      expect(getPracticeConflicts(checkIn), preset.id).toEqual([]);
      expect(checkIn.duration).toBe(preset.duration);
      expect(checkIn.style).toBe(preset.style);
      expect(checkIn.experience).toBe(preset.experience);
      expect(checkIn.intention).toBe(preset.intention);
      expect(checkIn.moment).toBe(preset.moment);
    }
  });
});
