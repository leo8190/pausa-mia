import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppStep,
  CheckInData,
  ConsentState,
  ContextSource,
  SessionEntryPath,
} from '../types';
import {
  applyStartNowDefaults,
  clearSession,
  createInitialSession,
  isCheckInComplete,
  isConsentValid,
  isSessionEmpty,
} from '../lib/session';
import { scanCheckInForDanger, scanTextForDanger } from '../lib/safetyDetector';
import { validateScriptQuality } from '../lib/scriptEngine';
import { collectSensitiveSourceTexts } from '../lib/sensitiveOverlap';
import {
  createAiProvider,
  createLocalProvider,
  type ScriptProvider,
} from '../lib/scriptProvider';
import { savePreferences, clearPreferences } from '../lib/preferencesStorage';
import { cancelActiveSpeech } from '../lib/speechController';
import { allowNextSessionComplete } from '../lib/visitorPing';
import type { MeditationStyle } from '../types';

export function useSession() {
  const [session, setSession] = useState(createInitialSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const checkAi = async () => {
      const provider = createAiProvider();
      const available = await provider.isAvailable();
      setSession((prev) => ({ ...prev, aiAvailable: available }));
    };
    void checkAi();
  }, []);

  const setStep = useCallback((step: AppStep) => {
    setSession((prev) => ({ ...prev, step }));
  }, []);

  const setEntryPath = useCallback((entryPath: SessionEntryPath) => {
    setSession((prev) => ({ ...prev, entryPath }));
  }, []);

  const updateConsent = useCallback((consent: Partial<ConsentState>) => {
    setSession((prev) => {
      const nextConsent = { ...prev.consent, ...consent };
      if (consent.savePreferences === true && prev.checkIn.style) {
        savePreferences({
          duration: prev.checkIn.duration,
          voiceVariant: prev.checkIn.voiceVariant,
          style: prev.checkIn.style as MeditationStyle,
        });
      }
      if (consent.savePreferences === false) {
        clearPreferences();
      }
      return { ...prev, consent: nextConsent };
    });
  }, []);

  const updateCheckIn = useCallback((checkIn: Partial<CheckInData>) => {
    setSession((prev) => {
      const nextCheckIn = { ...prev.checkIn, ...checkIn };
      if (prev.consent.savePreferences && checkIn.duration !== undefined) {
        savePreferences({
          duration: nextCheckIn.duration,
          voiceVariant: nextCheckIn.voiceVariant,
          style: nextCheckIn.style as MeditationStyle,
        });
      }
      return { ...prev, checkIn: nextCheckIn };
    });
  }, []);

  const updateContextSources = useCallback((sources: ContextSource[]) => {
    setSession((prev) => ({ ...prev, contextSources: sources }));
  }, []);

  const toggleExcluded = useCallback((field: string) => {
    setSession((prev) => {
      const next = new Set(prev.summaryExcluded);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return { ...prev, summaryExcluded: next };
    });
  }, []);

  const setUseAiEngine = useCallback((useAi: boolean) => {
    setSession((prev) => ({ ...prev, useAiEngine: useAi }));
  }, []);

  const generateWithProvider = useCallback(async (provider: ScriptProvider) => {
    const prev = sessionRef.current;
    const safety = scanCheckInForDanger(prev.checkIn);
    const contextText = prev.contextSources
      .filter((s) => s.selected && s.content.trim())
      .map((s) => s.content)
      .join(' ');
    const contextSafety = contextText ? scanTextForDanger(contextText) : null;

    if (safety.triggered || contextSafety?.triggered) {
      setSession((s) => ({
        ...s,
        safetyTriggered: true,
        safetyText: safety.sourceText || contextSafety?.sourceText || '',
        step: 'safety',
      }));
      return false;
    }

    try {
      const result = await provider.generate({
        checkIn: prev.checkIn,
        excluded: prev.summaryExcluded,
        sessionProcessing: prev.consent.sessionProcessing,
        aiTransmission: prev.consent.aiTransmission,
        contextSources: prev.contextSources,
      });

      const freeTextSources = collectSensitiveSourceTexts(
        prev.checkIn,
        prev.summaryExcluded,
        prev.contextSources,
      );
      const quality = validateScriptQuality(result.script, { freeTextSources });
      if (!quality.valid) {
        return false;
      }

      setSession((s) => ({
        ...s,
        script: result.script,
        scriptFallbackUsed: result.fallbackUsed ?? false,
        safetyTriggered: false,
        step: 'review',
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const tryGenerate = useCallback(() => {
    const prev = sessionRef.current;
    if (!prev.consent.sessionProcessing) return false;

    if (prev.useAiEngine && prev.aiAvailable) {
      setSession((s) => ({ ...s, step: 'ai-consent' }));
      return true;
    }

    const provider = createLocalProvider();
    void generateWithProvider(provider);
    return true;
  }, [generateWithProvider]);

  /**
   * Atajo de primera visita: omite check-in incompleto, contexto vacío, resumen
   * y consentimiento IA. Conserva consentimiento de sesión y la pausa de
   * seguridad; aplica defaults seguros (3 min, motor local, es-AR y campos
   * cerrados mínimos) y deja la revisión del guion.
   */
  const startNow = useCallback(() => {
    const prev = sessionRef.current;
    if (!prev.consent.sessionProcessing) return false;

    const nextCheckIn = applyStartNowDefaults(prev.checkIn);
    const nextSession = {
      ...prev,
      useAiEngine: false,
      checkIn: nextCheckIn,
    };
    sessionRef.current = nextSession;
    setSession(nextSession);

    const provider = createLocalProvider();
    void generateWithProvider(provider);
    return true;
  }, [generateWithProvider]);

  const confirmAiGenerate = useCallback(() => {
    const prev = sessionRef.current;
    if (!prev.consent.sessionProcessing || !prev.consent.aiTransmission) {
      return false;
    }
    const provider = createAiProvider();
    void generateWithProvider(provider);
    return true;
  }, [generateWithProvider]);

  const deleteSession = useCallback(() => {
    cancelActiveSpeech();
    clearPreferences();
    setSession({ ...clearSession(), step: 'deleted' });
  }, []);

  const resetToWelcome = useCallback(() => {
    cancelActiveSpeech();
    allowNextSessionComplete();
    setSession(createInitialSession());
  }, []);

  const setRating = useCallback((rating: number) => {
    setSession((prev) => ({ ...prev, rating }));
  }, []);

  const setSelectedPrice = useCallback((price: string) => {
    setSession((prev) => ({ ...prev, selectedPrice: price }));
  }, []);

  const setWouldRepeat = useCallback((value: boolean) => {
    setSession((prev) => ({ ...prev, wouldRepeat: value }));
  }, []);

  return {
    session,
    setStep,
    setEntryPath,
    updateConsent,
    updateCheckIn,
    updateContextSources,
    toggleExcluded,
    tryGenerate,
    startNow,
    confirmAiGenerate,
    setUseAiEngine,
    deleteSession,
    resetToWelcome,
    setRating,
    setSelectedPrice,
    setWouldRepeat,
    isConsentValid: isConsentValid(session.consent),
    isCheckInComplete: isCheckInComplete(session.checkIn),
    isSessionEmpty: isSessionEmpty(session),
  };
}

export type SessionApi = ReturnType<typeof useSession>;
