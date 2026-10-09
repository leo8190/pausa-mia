export type FunnelMeasurement = Readonly<{ elapsedMs: number }>;
export const MAX_SCRIPT_ELAPSED_MS = 300_000;

/** Closed numeric measurement only; never forward arbitrary objects or errors. */
export function validateFunnelMeasurement(
  event: string,
  value: unknown,
): FunnelMeasurement | null {
  if (
    !['script_generated', 'script_error'].includes(event) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).join(',') !== 'elapsedMs'
  )
    return null;
  const elapsedMs = (value as { elapsedMs: unknown }).elapsedMs;
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > MAX_SCRIPT_ELAPSED_MS
  )
    return null;
  return { elapsedMs };
}

/** Client monotonic generation + validation duration, not a server latency. */
export function measureScriptGeneration(
  start: number,
  end: number = performance.now(),
): FunnelMeasurement | undefined {
  const elapsedMs = Math.round(end - start);
  return validateFunnelMeasurement('script_generated', { elapsedMs }) ?? undefined;
}
