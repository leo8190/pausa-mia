import type { Duration, MeditationStyle, VoiceVariant } from '../types';

const PREFERENCES_KEY = 'mam-saved-preferences';

/** Solo se guardan variante, duración y estilo. Nunca diario, situación ni estado. */
export interface SavedPreferences {
  duration: Duration;
  voiceVariant: VoiceVariant;
  style: MeditationStyle | '';
}

export function savePreferences(prefs: SavedPreferences): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
}

export function loadPreferences(): SavedPreferences | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPreferences;
    if (
      typeof parsed.duration === 'number' &&
      typeof parsed.voiceVariant === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPreferences(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(PREFERENCES_KEY);
}

export function hasStoredPreferences(): boolean {
  return loadPreferences() !== null;
}
