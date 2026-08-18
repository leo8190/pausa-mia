/**
 * Identificadores cerrados permitidos en usedDetails.
 * Nunca incluir texto libre del usuario ni fragmentos de diario/importaciones.
 */
export const SAFE_USED_DETAIL_IDS = [
  'moment',
  'perceivedState',
  'recentSituation:present',
  'context:selected',
  'intention',
  'experience',
  'style',
  'name',
] as const;

export type SafeUsedDetailId = (typeof SAFE_USED_DETAIL_IDS)[number];

const ALLOWED_SET = new Set<string>(SAFE_USED_DETAIL_IDS);

export function isSafeUsedDetailId(value: string): value is SafeUsedDetailId {
  return ALLOWED_SET.has(value);
}

export function validateUsedDetailsAllowlist(usedDetails: string[]): string[] {
  const issues: string[] = [];
  if (!Array.isArray(usedDetails)) {
    issues.push('usedDetails debe ser un arreglo.');
    return issues;
  }
  for (const detail of usedDetails) {
    if (!isSafeUsedDetailId(detail)) {
      issues.push('usedDetails contiene un identificador no permitido.');
    }
  }
  return issues;
}
