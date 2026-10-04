import type {
  CheckInData,
  ContextSource,
  GeneratedScript,
  ScriptEngineType,
} from '../types';
import {
  buildAiTransmissionPayload,
  serializeAiTransmissionPayload,
} from './aiTransmissionPayload';
import {
  ConsentRequiredError,
  generateScript,
  validateScriptQuality,
} from './scriptEngine';
import { collectSensitiveSourceTexts } from './sensitiveOverlap';
import { scanTextForDanger } from './safetyDetector';
import { getPracticeConflicts } from './practiceCoherence';

export class AiTransmissionConsentError extends Error {
  constructor() {
    super('Se requiere consentimiento de transmisión a IA activo.');
    this.name = 'AiTransmissionConsentError';
  }
}

export interface ScriptGenerationContext {
  checkIn: CheckInData;
  excluded: Set<string>;
  sessionProcessing: boolean;
  aiTransmission: boolean;
  contextSources: ContextSource[];
  signal?: AbortSignal;
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Preparation cancelled', 'AbortError');
}

export interface ScriptProviderResult {
  script: GeneratedScript;
  engine: ScriptEngineType;
  fallbackUsed?: boolean;
}

export interface ScriptProvider {
  readonly name: string;
  readonly engine: ScriptEngineType;
  isAvailable(): Promise<boolean>;
  generate(context: ScriptGenerationContext): Promise<ScriptProviderResult>;
}

export class LocalScriptProvider implements ScriptProvider {
  readonly name = 'Motor local por reglas';
  readonly engine: ScriptEngineType = 'local';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(context: ScriptGenerationContext): Promise<ScriptProviderResult> {
    checkCancellation(context.signal);
    const script = generateScript(context.checkIn, context.excluded, {
      sessionProcessing: context.sessionProcessing,
      contextSources: context.contextSources,
      engine: 'local',
    });
    return { script, engine: 'local' };
  }
}

export class AiScriptProvider implements ScriptProvider {
  readonly name = 'Motor IA (servidor local)';
  readonly engine: ScriptEngineType = 'ai';
  private readonly apiUrl: string;

  constructor(apiUrl = '/api/generate-script') {
    this.apiUrl = apiUrl;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return false;
      const data = (await res.json()) as { aiEnabled?: boolean };
      return data.aiEnabled === true;
    } catch {
      return false;
    }
  }

  async generate(context: ScriptGenerationContext): Promise<ScriptProviderResult> {
    checkCancellation(context.signal);
    if (!context.sessionProcessing) {
      throw new ConsentRequiredError();
    }
    if (!context.aiTransmission) {
      throw new AiTransmissionConsentError();
    }
    const conflicts = getPracticeConflicts(context.checkIn, context.excluded);
    if (conflicts.length) throw new Error(conflicts.join(' '));

    const payload = buildAiTransmissionPayload(
      context.checkIn,
      context.excluded,
      context.contextSources,
      {
        sessionProcessing: true,
        aiTransmission: true,
        savePreferences: false,
      },
    );
    if (!payload) {
      throw new AiTransmissionConsentError();
    }

    const request = new AbortController();
    const cancel = () => request.abort();
    context.signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 30000);
    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeAiTransmissionPayload(payload),
        signal: request.signal,
      });

      if (!res.ok) throw new Error(`AI server error: ${res.status}`);

      const data = (await res.json()) as { script: GeneratedScript };
      checkCancellation(context.signal);
      const safety = scanTextForDanger(data.script.fullText);
      if (safety.triggered) {
        throw new Error('AI response triggered safety filter');
      }

      const freeTextSources = collectSensitiveSourceTexts(
        context.checkIn,
        context.excluded,
        context.contextSources,
      );
      const quality = validateScriptQuality(data.script, {
        freeTextSources,
        checkIn: context.checkIn,
        excluded: context.excluded,
      });
      if (!quality.valid) {
        throw new Error('AI_RESPONSE_QUALITY_FAILED');
      }

      return {
        script: { ...data.script, engine: 'ai' },
        engine: 'ai',
      };
    } catch {
      // Retirar permiso o salir cancela; un fallo de red sí conserva el fallback.
      checkCancellation(context.signal);
      const local = new LocalScriptProvider();
      const result = await local.generate(context);
      return { ...result, fallbackUsed: true };
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener('abort', cancel);
    }
  }
}

export function createLocalProvider(): ScriptProvider {
  return new LocalScriptProvider();
}

export function createAiProvider(): ScriptProvider {
  return new AiScriptProvider();
}
