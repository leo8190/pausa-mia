import { buildAccountApiUrl } from './accountApiUrl';

/**
 * Totales first-party de GET /api/visitors/count.
 * Compatibilidad: la API antigua (#18) sólo devolvía uniqueVisitors;
 * tras #23 también pageviews y sessionCompletes.
 */
export type VisitorCounts = {
  uniqueVisitors: number;
  pageviews: number | null;
  sessionCompletes: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Parsea ambas formas JSON del endpoint de conteo.
 * Devuelve null si falta uniqueVisitors o el cuerpo no es usable.
 */
export function parseVisitorCounts(data: unknown): VisitorCounts | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (!isFiniteNumber(body.uniqueVisitors)) return null;

  return {
    uniqueVisitors: body.uniqueVisitors,
    pageviews: isFiniteNumber(body.pageviews) ? body.pageviews : null,
    sessionCompletes: isFiniteNumber(body.sessionCompletes)
      ? body.sessionCompletes
      : null,
  };
}

/**
 * GET /api/visitors/count (sólo lectura). Misma base/CORS allowlist que el ping.
 * Falla en silencio → null (modo demo sin API). No envía id ni datos de sesión.
 */
export async function fetchVisitorCounts(
  env: Record<string, unknown> = import.meta.env,
  fetchImpl: typeof fetch = fetch,
): Promise<VisitorCounts | null> {
  try {
    const url = buildAccountApiUrl('/api/visitors/count', env);
    const response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
    });
    if (!response.ok) return null;
    return parseVisitorCounts(await response.json());
  } catch {
    return null;
  }
}
