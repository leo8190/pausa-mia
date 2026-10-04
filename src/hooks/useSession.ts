import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppStep, CheckInData, ConsentState, ContextSource } from '../types';
import {
  applyStartNowDefaults,
  clearSession,
  createInitialSession,
  isCheckInComplete,
  isConsentValid,
  isSessionEmpty,
} from '../lib/session';
import { scanCheckInForDanger, scanTextForDanger } from '../lib/safetyDetector';
import { generateScript, validateScriptQuality } from '../lib/scriptEngine';
import { collectSensitiveSourceTexts } from '../lib/sensitiveOverlap';
import {
  createAiProvider,
  createLocalProvider,
  type ScriptProvider,
} from '../lib/scriptProvider';
import { savePreferences, clearPreferences } from '../lib/preferencesStorage';
import { cancelActiveSpeech } from '../lib/speechController';
import { productFunnel } from '../lib/productFunnel';
import type { MeditationStyle } from '../types';

const GENERATION_ERROR =
  'No pudimos preparar tu meditación. Tus respuestas siguen acá. Podés volver a intentarlo.';

export function useSession() {
  const [session, setSession] = useState(createInitialSession);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const generationRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const cancelGeneration = useCallback(() => {
    generationRef.current?.abort();
    generationRef.current = null;
    setIsGenerating(false);
    setGenerationError('');
  }, []);

  useEffect(() => {
    let active = true;
    const checkAi = async () => {
      const provider = createAiProvider();
      const available = await provider.isAvailable();
      if (active) setSession((prev) => ({ ...prev, aiAvailable: available }));
    };
    void checkAi();
    return () => {
      active = false;
      generationRef.current?.abort();
      generationRef.current = null;
    };
  }, []);

  const setStep = useCallback(
    (step: AppStep) => {
      cancelGeneration();
      if (step === 'checkin') productFunnel.record('questionnaire_started');
      setSession((prev) => ({ ...prev, step }));
    },
    [cancelGeneration],
  );

  const updateConsent = useCallback(
    (consent: Partial<ConsentState>) => {
      cancelGeneration();
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
    },
    [cancelGeneration],
  );

  const updateCheckIn = useCallback(
    (checkIn: Partial<CheckInData>) => {
      cancelGeneration();
      setSession((prev) => {
        const nextCheckIn = { ...prev.checkIn, ...checkIn };
        // Al omitir el estado o dejar «Otro», no conservar texto personal oculto.
        if (nextCheckIn.perceivedState !== 'otro') {
          nextCheckIn.perceivedStateOther = '';
        }
        if (prev.consent.savePreferences && checkIn.duration !== undefined) {
          savePreferences({
            duration: nextCheckIn.duration,
            voiceVariant: nextCheckIn.voiceVariant,
            style: nextCheckIn.style as MeditationStyle,
          });
        }
        return { ...prev, checkIn: nextCheckIn };
      });
    },
    [cancelGeneration],
  );

  const updateContextSources = useCallback(
    (sources: ContextSource[]) => {
      cancelGeneration();
      setSession((prev) => ({ ...prev, contextSources: sources }));
    },
    [cancelGeneration],
  );

  const toggleExcluded = useCallback(
    (field: string) => {
      cancelGeneration();
      setSession((prev) => {
        const next = new Set(prev.summaryExcluded);
        if (next.has(field)) {
          next.delete(field);
        } else {
          next.add(field);
        }
        return { ...prev, summaryExcluded: next };
      });
    },
    [cancelGeneration],
  );

  const setUseAiEngine = useCallback(
    (useAi: boolean) => {
      cancelGeneration();
      setSession((prev) => ({ ...prev, useAiEngine: useAi }));
    },
    [cancelGeneration],
  );

  const generateWithProvider = useCallback(
    async (provider: ScriptProvider, afterGenerate: AppStep = 'review') => {
      if (generationRef.current) return false;
      const observe = productFunnel.capture();
      const prev = sessionRef.current;
      setGenerationError('');
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

      const request = new AbortController();
      generationRef.current = request;
      setIsGenerating(true);
      try {
        const result = await provider.generate({
          checkIn: prev.checkIn,
          excluded: prev.summaryExcluded,
          sessionProcessing: prev.consent.sessionProcessing,
          aiTransmission: prev.consent.aiTransmission,
          contextSources: prev.contextSources,
          signal: request.signal,
        });
        // Ni una respuesta ni un error viejos pueden restaurar una sesión borrada
        // o reemplazar una preparación nueva, incluso si el proveedor ignora abort.
        if (generationRef.current !== request || request.signal.aborted) return false;

        const freeTextSources = collectSensitiveSourceTexts(
          prev.checkIn,
          prev.summaryExcluded,
          prev.contextSources,
        );
        const quality = validateScriptQuality(result.script, {
          freeTextSources,
          checkIn: prev.checkIn,
          excluded: prev.summaryExcluded,
        });
        if (!quality.valid) {
          throw new Error('SCRIPT_QUALITY_FAILED');
        }

        observe('script_generated');
        setSession((s) => ({
          ...s,
          script: result.script,
          scriptFallbackUsed: result.fallbackUsed ?? false,
          safetyTriggered: false,
          step: afterGenerate,
        }));
        return true;
      } catch {
        if (generationRef.current !== request || request.signal.aborted) return false;
        observe('script_error');
        setGenerationError(GENERATION_ERROR);
        return false;
      } finally {
        if (generationRef.current === request) {
          generationRef.current = null;
          setIsGenerating(false);
        }
      }
    },
    [],
  );

  const tryGenerate = useCallback(() => {
    if (generationRef.current) return false;
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
   * Atajo de primera visita: omite contexto vacío, resumen, consentimiento IA
   * y la pantalla de revisión (el guion se lee en reproducción). Conserva
   * consentimiento de sesión y la pausa de seguridad.
   *
   * Generación local síncrona en un solo setSession → playback (o safety).
   * Evita el hueco async donde un fallo silencioso + recarga/Volver dejaba
   * la sesión en welcome vía createInitialSession / setStep('welcome').
   */
  const startNow = useCallback(() => {
    cancelGeneration();
    const observe = productFunnel.capture();
    const prev = sessionRef.current;
    if (!prev.consent.sessionProcessing) return false;
    if (!isCheckInComplete(prev.checkIn)) return false;

    const nextCheckIn = applyStartNowDefaults(prev.checkIn);
    const safety = scanCheckInForDanger(nextCheckIn);
    if (safety.triggered) {
      const safetySession = {
        ...prev,
        useAiEngine: false,
        checkIn: nextCheckIn,
        safetyTriggered: true,
        safetyText: safety.sourceText || '',
        autoStartPlayback: false,
        step: 'safety' as const,
      };
      sessionRef.current = safetySession;
      setSession(safetySession);
      return false;
    }

    try {
      const script = generateScript(nextCheckIn, prev.summaryExcluded, {
        sessionProcessing: prev.consent.sessionProcessing,
        contextSources: prev.contextSources,
        engine: 'local',
      });
      const freeTextSources = collectSensitiveSourceTexts(
        nextCheckIn,
        prev.summaryExcluded,
        prev.contextSources,
      );
      const quality = validateScriptQuality(script, {
        freeTextSources,
        checkIn: nextCheckIn,
        excluded: prev.summaryExcluded,
      });
      if (!quality.valid) {
        observe('script_error');
        setGenerationError(GENERATION_ERROR);
        return false;
      }

      observe('script_generated');
      // El clic de Empezar ahora es el gesto: reproducción intenta play una vez.
      const playbackSession = {
        ...prev,
        useAiEngine: false,
        checkIn: nextCheckIn,
        script,
        scriptFallbackUsed: false,
        safetyTriggered: false,
        safetyText: '',
        autoStartPlayback: true,
        step: 'playback' as const,
      };
      sessionRef.current = playbackSession;
      setSession(playbackSession);
      return true;
    } catch {
      observe('script_error');
      setGenerationError(GENERATION_ERROR);
      return false;
    }
  }, [cancelGeneration]);

  const clearAutoStartPlayback = useCallback(() => {
    setSession((prev) => {
      if (!prev.autoStartPlayback) return prev;
      const next = { ...prev, autoStartPlayback: false };
      sessionRef.current = next;
      return next;
    });
  }, []);

  const confirmAiGenerate = useCallback(() => {
    if (generationRef.current) return false;
    const prev = sessionRef.current;
    if (!prev.consent.sessionProcessing || !prev.consent.aiTransmission) {
      return false;
    }
    const provider = createAiProvider();
    void generateWithProvider(provider);
    return true;
  }, [generateWithProvider]);

  const deleteSession = useCallback(() => {
    cancelGeneration();
    productFunnel.setConsent(false);
    cancelActiveSpeech();
    clearPreferences();
    const empty = { ...clearSession(), step: 'deleted' as const };
    sessionRef.current = empty;
    setSession(empty);
  }, [cancelGeneration]);

  const resetToWelcome = useCallback(() => {
    cancelGeneration();
    cancelActiveSpeech();
    productFunnel.finishRun();
    const empty = createInitialSession();
    sessionRef.current = empty;
    setSession(empty);
  }, [cancelGeneration]);

  const setRating = useCallback((rating: number) => {
    productFunnel.record('feedback_given');
    setSession((prev) => ({ ...prev, rating }));
  }, []);

  const setSelectedPrice = useCallback((price: string) => {
    setSession((prev) => ({ ...prev, selectedPrice: price }));
  }, []);

  const setWouldRepeat = useCallback((value: boolean) => {
    productFunnel.record('feedback_given');
    setSession((prev) => ({ ...prev, wouldRepeat: value }));
  }, []);

  return {
    session,
    isGenerating,
    generationError,
    setStep,
    updateConsent,
    updateCheckIn,
    updateContextSources,
    toggleExcluded,
    tryGenerate,
    startNow,
    clearAutoStartPlayback,
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
