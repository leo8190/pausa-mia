import { describe, expect, it, vi } from 'vitest';
import { generateScript, validateScriptQuality } from '../lib/scriptEngine';
import { createContextSource } from '../lib/contextSources';
import { createEmptyCheckIn } from '../lib/session';
import { isDurationWithinTolerance } from '../lib/durationEstimator';
import {
  extractWordSequences,
  collectSensitiveSourceTexts,
  detectSensitiveOverlap,
} from '../lib/sensitiveOverlap';
import {
  isSafeUsedDetailId,
  SAFE_USED_DETAIL_IDS,
  validateUsedDetailsAllowlist,
} from '../lib/safeUsedDetails';
import { AiScriptProvider, type ScriptGenerationContext } from '../lib/scriptProvider';
import { buildAiTransmissionPayload } from '../lib/aiTransmissionPayload';

const SYNTHETIC_SITUATION = 'Tuve varias reuniones seguidas y todavía me quedan tareas';

function buildEvalCase1(
  overrides: Partial<ReturnType<typeof createEmptyCheckIn>> = {},
) {
  const checkIn = createEmptyCheckIn();
  checkIn.moment = 'pausa-laboral';
  checkIn.recentSituation = SYNTHETIC_SITUATION;
  checkIn.perceivedState = 'acelerado';
  checkIn.intention = 'calmar-ritmo';
  checkIn.experience = 'primera-vez';
  checkIn.style = 'respiracion-natural';
  checkIn.duration = 3;
  checkIn.voiceVariant = 'es-AR';
  Object.assign(checkIn, overrides);
  return checkIn;
}

function makeLongValidAiScript() {
  const filler =
    'Notá la respiración sin forzarla y recordá que podés mantener los ojos abiertos o detenerte cuando quieras.';
  const segments = Array.from({ length: 8 }, () => ({
    text: filler.repeat(4),
    pauseAfterMs: 8000,
  }));
  const fullText = segments.map((s) => s.text).join('\n\n');
  return {
    title: 'Pausa',
    intentionLabel: 'Calmar el ritmo',
    targetDuration: 3 as const,
    estimatedMinutes: 3,
    segments,
    fullText,
    usedDetails: ['moment', 'perceivedState'],
    engine: 'ai' as const,
  };
}

describe('script privacy and quality gates', () => {
  const genOpts = { sessionProcessing: true };

  it('local fallback never copies synthetic phrase or 5-word sequences', () => {
    const checkIn = buildEvalCase1();
    const script = generateScript(checkIn, new Set(), genOpts);
    const sequences = extractWordSequences(SYNTHETIC_SITUATION);

    expect(script.fullText).not.toContain(SYNTHETIC_SITUATION);
    for (const sequence of sequences) {
      expect(script.fullText.toLowerCase()).not.toContain(sequence);
    }
    for (const detail of script.usedDetails) {
      expect(detail).not.toContain('reuniones');
      expect(detail).not.toContain('tareas');
    }
  });

  it('selected diary changes only context presence, not content in local fallback', () => {
    const diaryText = 'CENTINELA_DIARIO_SELECCIONADO_PARA_PRESENCIA_SOLAMENTE';
    const checkIn = buildEvalCase1();
    const withDiary = generateScript(checkIn, new Set(), {
      ...genOpts,
      contextSources: [
        createContextSource('manual-diary', 'Diario hoy', diaryText, {
          selected: true,
        }),
      ],
    });
    const withoutDiary = generateScript(checkIn, new Set(), genOpts);

    expect(withDiary.usedDetails).toContain('context:selected');
    expect(withoutDiary.usedDetails).not.toContain('context:selected');
    expect(withDiary.fullText).not.toContain(diaryText);
    expect(withDiary.fullText).toMatch(/contexto de otras fuentes/i);
  });

  it('unselected diary and excluded fields are absent from all layers', () => {
    const sentinelDiary = 'CENTINELA_DIARIO_PRIVADO_NO_USAR';
    const sentinelName = 'CENTINELA_NOMBRE_NO_ENVIAR';
    const checkIn = buildEvalCase1({ name: sentinelName });
    const excluded = new Set(['name', 'recentSituation']);
    const script = generateScript(checkIn, excluded, {
      ...genOpts,
      contextSources: [
        createContextSource('import-text', 'Privado', sentinelDiary, {
          selected: false,
        }),
      ],
    });

    expect(script.fullText).not.toContain(sentinelDiary);
    expect(script.fullText).not.toContain(sentinelName);
    expect(script.fullText).not.toContain(SYNTHETIC_SITUATION);
    expect(script.usedDetails).not.toContain('recentSituation:present');
    expect(script.usedDetails).not.toContain('name');
    expect(script.usedDetails).not.toContain('context:selected');
  });

  it('usedDetails contains only allowlisted identifiers', () => {
    const script = generateScript(buildEvalCase1(), new Set(), genOpts);
    for (const detail of script.usedDetails) {
      expect(isSafeUsedDetailId(detail)).toBe(true);
      expect(SAFE_USED_DETAIL_IDS).toContain(detail);
    }
    const quality = validateScriptQuality(script);
    expect(quality.valid).toBe(true);
  });

  it('rejects provider output that copies user input and falls back to local', async () => {
    const context: ScriptGenerationContext = {
      checkIn: buildEvalCase1(),
      excluded: new Set(),
      sessionProcessing: true,
      aiTransmission: true,
      contextSources: [],
    };
    const payload = buildAiTransmissionPayload(
      context.checkIn,
      context.excluded,
      context.contextSources,
      { sessionProcessing: true, aiTransmission: true, savePreferences: false },
    )!;

    const copyingScript = makeLongValidAiScript();
    copyingScript.segments[0].text = `${SYNTHETIC_SITUATION}. ${copyingScript.segments[0].text}`;
    copyingScript.fullText = copyingScript.segments.map((s) => s.text).join('\n\n');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ script: copyingScript }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AiScriptProvider('/api/generate-script');
    const result = await provider.generate(context);

    expect(result.fallbackUsed).toBe(true);
    expect(result.engine).toBe('local');
    expect(result.script.fullText).not.toContain(SYNTHETIC_SITUATION);

    vi.unstubAllGlobals();
    expect(payload.personal.some((f) => f.label === 'Situación reciente')).toBe(true);
  });

  it('beginner and habitual produce clearly different instructions', () => {
    const beginner = generateScript(
      buildEvalCase1({ experience: 'primera-vez' }),
      new Set(),
      genOpts,
    );
    const habitual = generateScript(
      buildEvalCase1({ experience: 'habitual' }),
      new Set(),
      genOpts,
    );

    expect(beginner.fullText).toMatch(/primera vez/i);
    expect(habitual.fullText).toMatch(/práctica habitual/i);
    expect(beginner.fullText).not.toMatch(/práctica habitual/i);
    expect(habitual.fullText).not.toMatch(/primera vez/i);
  });

  it('includes explicit autonomy option', () => {
    const script = generateScript(buildEvalCase1(), new Set(), genOpts);
    expect(script.fullText).toMatch(/ojos abiertos/i);
    expect(script.fullText).toMatch(/ancla de atención|detenerte/i);
  });

  it('supports durations 3/5/10 and both voice variants within tolerance', () => {
    for (const duration of [3, 5, 10] as const) {
      for (const voiceVariant of ['es-AR', 'es-neutro'] as const) {
        const script = generateScript(
          buildEvalCase1({ duration, voiceVariant }),
          new Set(),
          genOpts,
        );
        expect(isDurationWithinTolerance(script.estimatedMinutes, duration)).toBe(true);
        if (voiceVariant === 'es-AR') {
          expect(script.fullText).toMatch(/Podés|podés|Volvé|volvé|Confiá/i);
        } else {
          expect(script.fullText).toMatch(/Puedes|puedes|Vuelve|vuelve|Confía/i);
        }
        const quality = validateScriptQuality(script);
        expect(quality.valid).toBe(true);
      }
    }
  });

  it('detectSensitiveOverlap flags five-word sequences and long fragments', () => {
    const source = SYNTHETIC_SITUATION;
    const overlap = detectSensitiveOverlap(
      'Algo sobre tuve varias reuniones seguidas y todavía en la pausa.',
      [source],
    );
    expect(overlap.hasOverlap).toBe(true);

    const safe = detectSensitiveOverlap(
      'Notá la respiración y el contacto con el asiento, sin apuro.',
      [source],
    );
    expect(safe.hasOverlap).toBe(false);
  });

  it('validateUsedDetailsAllowlist does not echo rejected values in issues', () => {
    const sensitive = SYNTHETIC_SITUATION;
    const issues = validateUsedDetailsAllowlist(['moment', sensitive]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(' ')).not.toContain('reuniones');
    expect(issues.join(' ')).not.toContain(sensitive);
  });

  it('collectSensitiveSourceTexts respects exclusions', () => {
    const checkIn = buildEvalCase1({ name: 'Ana' });
    const excluded = new Set(['recentSituation', 'name']);
    const sources = collectSensitiveSourceTexts(checkIn, excluded, []);
    expect(sources).not.toContain(SYNTHETIC_SITUATION);
    expect(sources).not.toContain('Ana');
  });
});
