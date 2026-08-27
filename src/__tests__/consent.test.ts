import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyStartNowDefaults,
  createEmptyConsent,
  isConsentValid,
  clearSession,
  isSessionEmpty,
  createInitialSession,
  createBlankCheckIn,
  isCheckInComplete,
  createEmptyCheckIn,
} from '../lib/session';
import { ConsentRequiredError, generateScript } from '../lib/scriptEngine';
import {
  savePreferences,
  loadPreferences,
  clearPreferences,
  hasStoredPreferences,
} from '../lib/preferencesStorage';

describe('consent', () => {
  it('rejects empty consent by default', () => {
    const consent = createEmptyConsent();
    expect(consent.sessionProcessing).toBe(false);
    expect(consent.savePreferences).toBe(false);
    expect(consent.aiTransmission).toBe(false);
    expect(isConsentValid(consent)).toBe(false);
  });

  it('requires explicit session processing consent', () => {
    const consent = {
      sessionProcessing: true,
      savePreferences: false,
      aiTransmission: false,
    };
    expect(isConsentValid(consent)).toBe(true);
  });

  it('does not accept savePreferences alone as valid consent', () => {
    const consent = {
      sessionProcessing: false,
      savePreferences: true,
      aiTransmission: false,
    };
    expect(isConsentValid(consent)).toBe(false);
  });

  it('consent checkboxes are not preselected in initial session', () => {
    const session = createInitialSession();
    expect(session.consent.sessionProcessing).toBe(false);
    expect(session.consent.savePreferences).toBe(false);
    expect(session.consent.aiTransmission).toBe(false);
  });

  it('generation layer rejects without sessionProcessing even if invoked directly', () => {
    const checkIn = createEmptyCheckIn();
    checkIn.moment = 'ahora';
    checkIn.perceivedState = 'tranquilo';
    checkIn.intention = 'descansar';
    checkIn.experience = 'basica';
    checkIn.style = 'respiracion-natural';
    expect(() =>
      generateScript(checkIn, new Set(), { sessionProcessing: false }),
    ).toThrow(ConsentRequiredError);
  });
});

describe('start-now defaults', () => {
  it('fills closed fields so a blank check-in becomes complete', () => {
    const filled = applyStartNowDefaults(createBlankCheckIn());
    expect(filled.duration).toBe(3);
    expect(filled.voiceVariant).toBe('es-AR');
    expect(filled.moment).toBe('ahora');
    expect(filled.perceivedState).toBe('tranquilo');
    expect(filled.intention).toBe('calmar-ritmo');
    expect(filled.experience).toBe('primera-vez');
    expect(filled.style).toBe('respiracion-natural');
    expect(isCheckInComplete(filled)).toBe(true);
  });

  it('preserves fields already chosen by the person', () => {
    const checkIn = createBlankCheckIn();
    checkIn.moment = 'antes-de-dormir';
    checkIn.perceivedState = 'cansado';
    checkIn.intention = 'descansar';
    checkIn.experience = 'habitual';
    checkIn.style = 'recorrido-corporal';
    checkIn.duration = 10;
    checkIn.voiceVariant = 'es-neutro';

    const filled = applyStartNowDefaults(checkIn);
    expect(filled.moment).toBe('antes-de-dormir');
    expect(filled.perceivedState).toBe('cansado');
    expect(filled.intention).toBe('descansar');
    expect(filled.experience).toBe('habitual');
    expect(filled.style).toBe('recorrido-corporal');
    expect(filled.duration).toBe(3);
    expect(filled.voiceVariant).toBe('es-AR');
  });

  it('generates a valid local script from blank check-in defaults', () => {
    const checkIn = applyStartNowDefaults(createBlankCheckIn());
    const script = generateScript(checkIn, new Set(), { sessionProcessing: true });
    expect(script.targetDuration).toBe(3);
    expect(script.usedDetails.length).toBeGreaterThanOrEqual(2);
  });
});

describe('preferences storage', () => {
  beforeEach(() => {
    clearPreferences();
  });

  it('saves only variant, duration and style', () => {
    savePreferences({
      duration: 10,
      voiceVariant: 'es-AR',
      style: 'atencion-abierta',
    });
    const loaded = loadPreferences();
    expect(loaded).toEqual({
      duration: 10,
      voiceVariant: 'es-AR',
      style: 'atencion-abierta',
    });
    expect(hasStoredPreferences()).toBe(true);
  });

  it('clears preferences on clearPreferences', () => {
    savePreferences({ duration: 3, voiceVariant: 'es-neutro', style: 'autocompasion' });
    clearPreferences();
    expect(loadPreferences()).toBeNull();
    expect(hasStoredPreferences()).toBe(false);
  });
});

describe('session deletion', () => {
  beforeEach(() => {
    clearPreferences();
  });

  it('clears all session data on delete', () => {
    const session = createInitialSession();
    session.consent.sessionProcessing = true;
    session.checkIn.name = 'Ana';
    session.checkIn.moment = 'ahora';
    session.checkIn.recentSituation = 'Día largo';
    session.checkIn.perceivedState = 'cansado';
    session.checkIn.intention = 'descansar';
    session.checkIn.experience = 'basica';
    session.checkIn.style = 'respiracion-natural';
    session.rating = 5;
    session.selectedPrice = 'monthly';

    savePreferences({
      duration: 5,
      voiceVariant: 'es-neutro',
      style: 'respiracion-natural',
    });

    clearPreferences();
    const cleared = clearSession();
    expect(isSessionEmpty(cleared)).toBe(true);
    expect(cleared.step).toBe('welcome');
    expect(cleared.entryPath).toBe('full');
    expect(cleared.script).toBeNull();
    expect(cleared.rating).toBeNull();
    expect(cleared.selectedPrice).toBeNull();
    expect(hasStoredPreferences()).toBe(false);
  });

  it('clearSession ignores leftover preferences key until clearPreferences runs', () => {
    savePreferences({
      duration: 10,
      voiceVariant: 'es-AR',
      style: 'atencion-abierta',
    });
    const cleared = clearSession();
    expect(cleared.checkIn.duration).toBe(5);
    expect(cleared.checkIn.voiceVariant).toBe('es-neutro');
    expect(cleared.checkIn.style).toBe('');
    expect(isSessionEmpty(cleared)).toBe(true);
  });
});
