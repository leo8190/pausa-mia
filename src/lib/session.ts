import type { CheckInData, ConsentState, SessionState } from '../types';
import { createManualDiarySources } from './contextSources';
import { loadPreferences } from './preferencesStorage';

/** Check-in en blanco, sin releer preferencias guardadas. */
export function createBlankCheckIn(): CheckInData {
  return {
    name: '',
    moment: '',
    recentSituation: '',
    perceivedState: '',
    perceivedStateOther: '',
    intention: '',
    experience: '',
    style: '',
    avoidTopics: '',
    duration: 5,
    voiceVariant: 'es-neutro',
  };
}

export function createEmptyCheckIn(): CheckInData {
  const prefs = loadPreferences();
  const blank = createBlankCheckIn();
  if (!prefs) return blank;
  return {
    ...blank,
    style: prefs.style ?? '',
    duration: prefs.duration ?? 5,
    voiceVariant: prefs.voiceVariant ?? 'es-neutro',
  };
}

/**
 * Defaults seguros del atajo “Empezar ahora”: 3 min, es-AR y campos cerrados
 * mínimos para generar un guion local. Conserva valores ya elegidos.
 */
export function applyStartNowDefaults(checkIn: CheckInData): CheckInData {
  return {
    ...checkIn,
    duration: 3,
    voiceVariant: 'es-AR',
    moment: checkIn.moment || 'ahora',
    perceivedState: checkIn.perceivedState || 'tranquilo',
    intention: checkIn.intention || 'calmar-ritmo',
    experience: checkIn.experience || 'primera-vez',
    style: checkIn.style || 'respiracion-natural',
  };
}

export function createEmptyConsent(): ConsentState {
  return {
    sessionProcessing: false,
    savePreferences: false,
    aiTransmission: false,
  };
}

export function createInitialSession(): SessionState {
  return {
    step: 'welcome',
    consent: createEmptyConsent(),
    checkIn: createEmptyCheckIn(),
    contextSources: createManualDiarySources(),
    summaryExcluded: new Set(),
    script: null,
    scriptFallbackUsed: false,
    autoStartPlayback: false,
    useAiEngine: false,
    aiAvailable: false,
    safetyTriggered: false,
    safetyText: '',
    voiceFallback: null,
    rating: null,
    selectedPrice: null,
    wouldRepeat: null,
  };
}

export function isConsentValid(consent: ConsentState): boolean {
  return consent.sessionProcessing === true;
}

export function isCheckInComplete(checkIn: CheckInData): boolean {
  return (
    checkIn.moment !== '' &&
    checkIn.perceivedState !== '' &&
    checkIn.intention !== '' &&
    checkIn.experience !== '' &&
    checkIn.style !== ''
  );
}

export function getActiveCheckInFields(
  checkIn: CheckInData,
  excluded: Set<string>,
): Record<string, string> {
  const fields: Record<string, string> = {};

  if (!excluded.has('name') && checkIn.name.trim()) {
    fields.name = checkIn.name.trim();
  }
  if (!excluded.has('moment') && checkIn.moment) {
    fields.moment = checkIn.moment;
  }
  if (!excluded.has('recentSituation') && checkIn.recentSituation.trim()) {
    fields.recentSituation = checkIn.recentSituation.trim();
  }
  if (!excluded.has('perceivedState') && checkIn.perceivedState) {
    fields.perceivedState =
      checkIn.perceivedState === 'otro'
        ? checkIn.perceivedStateOther.trim() || 'otro'
        : checkIn.perceivedState;
  }
  if (!excluded.has('intention') && checkIn.intention) {
    fields.intention = checkIn.intention;
  }
  if (!excluded.has('experience') && checkIn.experience) {
    fields.experience = checkIn.experience;
  }
  if (!excluded.has('style') && checkIn.style) {
    fields.style = checkIn.style;
  }
  if (!excluded.has('avoidTopics') && checkIn.avoidTopics.trim()) {
    fields.avoidTopics = checkIn.avoidTopics.trim();
  }
  if (!excluded.has('duration')) {
    fields.duration = String(checkIn.duration);
  }
  if (!excluded.has('voiceVariant')) {
    fields.voiceVariant = checkIn.voiceVariant;
  }

  return fields;
}

/**
 * Estado de sesión totalmente vacío. No rehidrata preferencias locales:
 * el borrado debe dejar check-in, diario, guion y consentimientos en cero
 * aunque `clearPreferences` aún no haya corrido.
 */
export function clearSession(): SessionState {
  return {
    step: 'welcome',
    consent: createEmptyConsent(),
    checkIn: createBlankCheckIn(),
    contextSources: createManualDiarySources(),
    summaryExcluded: new Set(),
    script: null,
    scriptFallbackUsed: false,
    autoStartPlayback: false,
    useAiEngine: false,
    aiAvailable: false,
    safetyTriggered: false,
    safetyText: '',
    voiceFallback: null,
    rating: null,
    selectedPrice: null,
    wouldRepeat: null,
  };
}

export function isSessionEmpty(session: SessionState): boolean {
  const checkIn = session.checkIn;
  const hasContextContent = session.contextSources.some((s) => s.content.trim());
  return (
    !session.consent.sessionProcessing &&
    !session.consent.savePreferences &&
    !session.consent.aiTransmission &&
    checkIn.name === '' &&
    checkIn.moment === '' &&
    checkIn.recentSituation === '' &&
    checkIn.perceivedState === '' &&
    checkIn.perceivedStateOther === '' &&
    checkIn.intention === '' &&
    checkIn.experience === '' &&
    checkIn.style === '' &&
    checkIn.avoidTopics === '' &&
    checkIn.duration === 5 &&
    checkIn.voiceVariant === 'es-neutro' &&
    !hasContextContent &&
    session.summaryExcluded.size === 0 &&
    session.script === null &&
    !session.autoStartPlayback &&
    !session.safetyTriggered &&
    session.safetyText === '' &&
    session.rating === null &&
    session.selectedPrice === null &&
    session.wouldRepeat === null
  );
}
