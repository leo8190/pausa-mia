import { describe, expect, it, vi } from 'vitest';
import {
  AI_TEXT_MAX_LENGTH,
  assertAllPayloadValuesVisible,
  assertNoHiddenTransmissionKeys,
  buildAiTransmissionData,
  buildAiTransmissionPayload,
  payloadToPreviewEntries,
  serializeAiTransmissionPayload,
  serializeExactTechnicalJson,
} from '../lib/aiTransmissionPayload';
import { createContextSource } from '../lib/contextSources';
import { createEmptyCheckIn, createEmptyConsent } from '../lib/session';
import {
  AiScriptProvider,
  AiTransmissionConsentError,
  type ScriptGenerationContext,
} from '../lib/scriptProvider';
import { ConsentRequiredError } from '../lib/scriptEngine';

const SENTINEL_AVOID = 'SENTINEL_AVOID_TOPIC_XYZ789';
const SENTINEL_EXCLUDED_NAME = 'SENTINEL_EXCLUDED_NAME_XYZ789';
const SENTINEL_FULL_DIARY = `SENTINEL_DIARY_${'x'.repeat(500)}`;
const SENTINEL_UNSELECTED = 'SENTINEL_UNSELECTED_SOURCE_ABC123';
const SENTINEL_PERCEIVED_OTHER = 'SENTINEL_PERCEIVED_OTHER_DEF456';

function buildSentinelContext(): ScriptGenerationContext {
  const checkIn = createEmptyCheckIn();
  checkIn.name = SENTINEL_EXCLUDED_NAME;
  checkIn.moment = 'ahora';
  checkIn.recentSituation = `${'a'.repeat(250)}SENTINEL_SITUATION_TAIL`;
  checkIn.perceivedState = 'otro';
  checkIn.perceivedStateOther = SENTINEL_PERCEIVED_OTHER;
  checkIn.intention = 'descansar';
  checkIn.experience = 'basica';
  checkIn.style = 'respiracion-natural';
  checkIn.avoidTopics = SENTINEL_AVOID;
  checkIn.duration = 5;
  checkIn.voiceVariant = 'es-neutro';

  const excluded = new Set(['name', 'avoidTopics']);
  const contextSources = [
    createContextSource('manual-diary', 'Diario seleccionado', SENTINEL_FULL_DIARY, {
      selected: true,
    }),
    createContextSource('import-text', 'Fuente no seleccionada', SENTINEL_UNSELECTED, {
      selected: false,
    }),
  ];

  return {
    checkIn,
    excluded,
    sessionProcessing: true,
    aiTransmission: true,
    contextSources,
  };
}

describe('aiTransmissionPayload', () => {
  it('excluye campos marcados y nunca transmite avoidTopics ni consentimientos', () => {
    const context = buildSentinelContext();
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
    expect(payload).not.toBeNull();
    const serialized = serializeAiTransmissionPayload(payload!);

    expect(serialized).not.toContain(SENTINEL_EXCLUDED_NAME);
    expect(serialized).not.toContain(SENTINEL_AVOID);
    expect(serialized).not.toContain('avoidTopics');
    expect(serialized).not.toContain('consents');
    expect(serialized).not.toContain('sessionProcessing');
    expect(serialized).not.toContain('aiTransmission');
    expect(serialized).not.toContain('"id"');
    expect(serialized).not.toContain('"field"');
    expect(payload!.personal.some((field) => field.label === 'Nombre o apodo')).toBe(
      false,
    );
  });

  it('recorta fragmentos a 200 caracteres y sólo incluye fuentes seleccionadas', () => {
    const context = buildSentinelContext();
    const payload = buildAiTransmissionPayload(
      context.checkIn,
      context.excluded,
      context.contextSources,
      {
        sessionProcessing: true,
        aiTransmission: true,
        savePreferences: false,
      },
    )!;

    expect(payload.context).toHaveLength(1);
    expect(payload.context[0].value.length).toBeLessThanOrEqual(AI_TEXT_MAX_LENGTH);
    expect(payload.context[0].value.startsWith('SENTINEL_DIARY_')).toBe(true);
    expect(
      payload.personal.find((field) => field.label === 'Situación reciente')?.value
        .length,
    ).toBe(AI_TEXT_MAX_LENGTH);

    const serialized = serializeAiTransmissionPayload(payload);
    expect(serialized).not.toContain(SENTINEL_UNSELECTED);
    expect(serialized).not.toContain(SENTINEL_FULL_DIARY);
  });

  it('vista previa y body comparten el mismo objeto sin claves ocultas', () => {
    const context = buildSentinelContext();
    const data = buildAiTransmissionData(
      context.checkIn,
      context.excluded,
      context.contextSources,
    );
    const payload = buildAiTransmissionPayload(
      context.checkIn,
      context.excluded,
      context.contextSources,
      {
        sessionProcessing: true,
        aiTransmission: true,
        savePreferences: false,
      },
    )!;

    expect(payload).toEqual(data);

    const body = JSON.parse(serializeAiTransmissionPayload(payload)) as {
      payload: typeof payload;
    };

    expect(assertNoHiddenTransmissionKeys(body)).toEqual([]);
    expect(assertAllPayloadValuesVisible(payload)).toEqual([]);
    expect(body.payload).toEqual(payload);

    const previewValues = new Set(
      payloadToPreviewEntries(payload).map((entry) => entry.value),
    );
    const exactJson = serializeExactTechnicalJson(payload);
    for (const value of previewValues) {
      expect(exactJson).toContain(value);
    }
  });

  it('requiere consentimiento de sesión y de transmisión para enviar', async () => {
    const context = buildSentinelContext();
    const provider = new AiScriptProvider('/api/generate-script');

    await expect(
      provider.generate({ ...context, sessionProcessing: false }),
    ).rejects.toThrow(ConsentRequiredError);

    await expect(
      provider.generate({ ...context, aiTransmission: false }),
    ).rejects.toThrow(AiTransmissionConsentError);

    expect(
      buildAiTransmissionPayload(
        context.checkIn,
        context.excluded,
        context.contextSources,
        createEmptyConsent(),
      ),
    ).toBeNull();
  });

  it('intercepta fetch y demuestra igualdad profunda preview/body', async () => {
    const context = buildSentinelContext();
    const payload = buildAiTransmissionPayload(
      context.checkIn,
      context.excluded,
      context.contextSources,
      {
        sessionProcessing: true,
        aiTransmission: true,
        savePreferences: false,
      },
    )!;
    const expectedBody = serializeAiTransmissionPayload(payload);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        script: {
          title: 'Pausa',
          intentionLabel: 'Descansar',
          targetDuration: 5,
          estimatedMinutes: 5,
          segments: [
            {
              text: 'Respirá suavemente un momento. Podés mantener los ojos abiertos o detenerte.',
              pauseAfterMs: 8000,
            },
            {
              text: 'Notá el cuerpo apoyado sin forzar la respiración en este instante presente.',
              pauseAfterMs: 8000,
            },
            {
              text: 'Volvé cuando quieras, sin apuro ni expectativas sobre el resultado.',
              pauseAfterMs: 8000,
            },
          ],
          fullText:
            'Respirá suavemente un momento. Podés mantener los ojos abiertos o detenerte.\n\nNotá el cuerpo apoyado sin forzar la respiración en este instante presente.\n\nVolvé cuando quieras, sin apuro ni expectativas sobre el resultado.',
          usedDetails: ['moment', 'perceivedState'],
          engine: 'ai',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AiScriptProvider('/api/generate-script');
    await provider.generate(context);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.body).toBe(expectedBody);
    expect(JSON.parse(String(requestInit.body))).toEqual(JSON.parse(expectedBody));
    expect(
      assertNoHiddenTransmissionKeys(JSON.parse(String(requestInit.body))),
    ).toEqual([]);

    vi.unstubAllGlobals();
  });

  it('no incluye metadatos ocultos del check-in crudo', () => {
    const context = buildSentinelContext();
    const payload = buildAiTransmissionPayload(
      context.checkIn,
      context.excluded,
      context.contextSources,
      {
        sessionProcessing: true,
        aiTransmission: true,
        savePreferences: false,
      },
    )!;
    const serialized = serializeAiTransmissionPayload(payload);

    expect(serialized).not.toContain('"checkIn"');
    expect(serialized).not.toContain('"excluded"');
    expect(serialized).not.toContain('"summaryExcluded"');
    expect(serialized).not.toContain('"content"');
    expect(serialized).not.toContain('perceivedStateOther');
    expect(serialized).not.toContain('avoidTopics');
  });
});
