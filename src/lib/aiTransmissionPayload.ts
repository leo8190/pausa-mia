import type { CheckInData, ConsentState, Duration, VoiceVariant } from '../types';
import { FIELD_LABELS } from '../types';
import type { ContextSource } from './contextSources';
import { getCheckInSummaryValue } from './checkInSummary';

/** Máximo de caracteres por fragmento personal o de contexto transmitido a IA */
export const AI_TEXT_MAX_LENGTH = 200;

/** Máximo de fuentes de contexto seleccionadas en un envío */
export const AI_MAX_CONTEXT_SOURCES = 10;

/** Máximo de campos personales en un envío */
export const AI_MAX_PERSONAL_FIELDS = 7;

export type AiPersonalFieldKey =
  | 'name'
  | 'moment'
  | 'recentSituation'
  | 'perceivedState'
  | 'intention'
  | 'experience'
  | 'style';

export interface AiPersonalField {
  label: string;
  value: string;
}

export interface AiContextFragment {
  label: string;
  value: string;
}

export interface AiOperationalConfig {
  duration: Duration;
  voiceVariant: VoiceVariant;
}

export interface AiTransmissionPayload {
  operational: AiOperationalConfig;
  personal: AiPersonalField[];
  context: AiContextFragment[];
}

export interface AiPreviewEntry {
  section: 'operational' | 'personal' | 'context';
  label: string;
  value: string;
}

export const AI_TRANSMISSION_ROOT_KEYS = ['payload'] as const;
export const AI_TRANSMISSION_PAYLOAD_KEYS = [
  'operational',
  'personal',
  'context',
] as const;
export const AI_TRANSMISSION_OPERATIONAL_KEYS = ['duration', 'voiceVariant'] as const;
export const AI_TRANSMISSION_PERSONAL_KEYS = ['label', 'value'] as const;
export const AI_TRANSMISSION_CONTEXT_KEYS = ['label', 'value'] as const;

const PERSONAL_FIELD_KEYS: AiPersonalFieldKey[] = [
  'name',
  'moment',
  'recentSituation',
  'perceivedState',
  'intention',
  'experience',
  'style',
];

function truncateForAi(value: string): string {
  return value.slice(0, AI_TEXT_MAX_LENGTH);
}

function collectExtraKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(obj).filter((key) => !allowed.includes(key));
}

export function buildAiTransmissionData(
  checkIn: CheckInData,
  excluded: Set<string>,
  contextSources: ContextSource[],
): AiTransmissionPayload {
  const personal: AiPersonalField[] = [];
  for (const field of PERSONAL_FIELD_KEYS) {
    if (excluded.has(field)) continue;
    const rawValue = getCheckInSummaryValue(field, checkIn);
    if (!rawValue) continue;
    const value = field === 'recentSituation' ? truncateForAi(rawValue) : rawValue;
    personal.push({
      label: FIELD_LABELS[field],
      value,
    });
  }

  const context = contextSources
    .filter((source) => source.selected && source.content.trim())
    .slice(0, AI_MAX_CONTEXT_SOURCES)
    .map((source) => ({
      label: source.label,
      value: truncateForAi(source.content.trim()),
    }));

  return {
    operational: {
      duration: checkIn.duration,
      voiceVariant: checkIn.voiceVariant,
    },
    personal,
    context,
  };
}

export function buildAiTransmissionPayload(
  checkIn: CheckInData,
  excluded: Set<string>,
  contextSources: ContextSource[],
  consent: ConsentState,
): AiTransmissionPayload | null {
  if (!consent.sessionProcessing || !consent.aiTransmission) {
    return null;
  }
  return buildAiTransmissionData(checkIn, excluded, contextSources);
}

export function payloadToPreviewEntries(
  payload: AiTransmissionPayload,
): AiPreviewEntry[] {
  const entries: AiPreviewEntry[] = [
    {
      section: 'operational',
      label: FIELD_LABELS.duration,
      value: String(payload.operational.duration),
    },
    {
      section: 'operational',
      label: FIELD_LABELS.voiceVariant,
      value: payload.operational.voiceVariant,
    },
  ];

  for (const field of payload.personal) {
    entries.push({
      section: 'personal',
      label: field.label,
      value: field.value,
    });
  }

  for (const fragment of payload.context) {
    entries.push({
      section: 'context',
      label: fragment.label,
      value: fragment.value,
    });
  }

  return entries;
}

export function serializeAiTransmissionPayload(payload: AiTransmissionPayload): string {
  return JSON.stringify({ payload });
}

export function serializeExactTechnicalJson(payload: AiTransmissionPayload): string {
  return JSON.stringify({ payload }, null, 2);
}

export function collectVisibleTransmissionValues(
  payload: AiTransmissionPayload,
): string[] {
  return payloadToPreviewEntries(payload).map((entry) => entry.value);
}

export function assertNoHiddenTransmissionKeys(
  body: Record<string, unknown>,
): string[] {
  const issues: string[] = [];

  const rootExtras = collectExtraKeys(body, AI_TRANSMISSION_ROOT_KEYS);
  if (rootExtras.length > 0) {
    issues.push(`root: claves extra: ${rootExtras.join(', ')}`);
  }

  const payload = body.payload;
  if (!payload || typeof payload !== 'object') {
    issues.push('payload ausente o inválido');
    return issues;
  }

  const payloadObj = payload as Record<string, unknown>;
  const payloadExtras = collectExtraKeys(payloadObj, AI_TRANSMISSION_PAYLOAD_KEYS);
  if (payloadExtras.length > 0) {
    issues.push(`payload: claves extra: ${payloadExtras.join(', ')}`);
  }

  const operational = payloadObj.operational;
  if (operational && typeof operational === 'object') {
    const opExtras = collectExtraKeys(
      operational as Record<string, unknown>,
      AI_TRANSMISSION_OPERATIONAL_KEYS,
    );
    if (opExtras.length > 0) {
      issues.push(`operational: claves extra: ${opExtras.join(', ')}`);
    }
  }

  const personal = payloadObj.personal;
  if (Array.isArray(personal)) {
    for (let i = 0; i < personal.length; i++) {
      const item = personal[i];
      if (item && typeof item === 'object') {
        const itemExtras = collectExtraKeys(
          item as Record<string, unknown>,
          AI_TRANSMISSION_PERSONAL_KEYS,
        );
        if (itemExtras.length > 0) {
          issues.push(`personal[${i}]: claves extra: ${itemExtras.join(', ')}`);
        }
      }
    }
  }

  const context = payloadObj.context;
  if (Array.isArray(context)) {
    for (let i = 0; i < context.length; i++) {
      const item = context[i];
      if (item && typeof item === 'object') {
        const itemExtras = collectExtraKeys(
          item as Record<string, unknown>,
          AI_TRANSMISSION_CONTEXT_KEYS,
        );
        if (itemExtras.length > 0) {
          issues.push(`context[${i}]: claves extra: ${itemExtras.join(', ')}`);
        }
      }
    }
  }

  return issues;
}

export function assertAllPayloadValuesVisible(
  payload: AiTransmissionPayload,
): string[] {
  const issues: string[] = [];
  const visibleSet = new Set(collectVisibleTransmissionValues(payload));

  const transmittedValues = [
    String(payload.operational.duration),
    payload.operational.voiceVariant,
    ...payload.personal.map((field) => field.value),
    ...payload.context.map((fragment) => fragment.value),
  ];

  for (const value of transmittedValues) {
    if (!visibleSet.has(value)) {
      issues.push(`valor transmitido sin vista amigable: ${value.slice(0, 40)}`);
    }
  }

  return issues;
}
