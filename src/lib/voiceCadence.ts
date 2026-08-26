/**
 * Cadencia serena compartida por las rutas de voz.
 * Fuentes canónicas de síntesis: `piperEngine` (Piper local) y `voiceService`
 * (Web Speech). El servicio remoto usa el mismo factor de length_scale.
 */
import type { ScriptSegment } from '../types';

export {
  SERENE_CADENCE_SCALE as MEDITATION_LENGTH_SCALE,
  resolveSereneLengthScale as resolvePiperLengthScale,
} from './piperEngine';

export {
  CALM_SPEECH_RATE as MEDITATION_SPEECH_RATE,
  ARGENTINE_WEB_SPEECH_RATE,
  ARGENTINE_WEB_SPEECH_PITCH,
} from './voiceService';

/** Rate histórico de Web Speech antes del ajuste de cadencia calma. */
export const BASE_WEB_SPEECH_RATE = 0.9;

/**
 * Alarga un poco las pausas entre frases en rutas argentinas (neuronal y
 * fallback Web Speech) sin reescribir el guion editorial.
 */
export const ARGENTINE_PAUSE_SCALE = 1.12;

/** Aplica la escala de pausas argentina. No muta los segmentos originales. */
export function scalePausesForArgentineDelivery(
  segments: ScriptSegment[],
): ScriptSegment[] {
  return segments.map((seg) => ({
    ...seg,
    pauseAfterMs: Math.max(0, Math.round(seg.pauseAfterMs * ARGENTINE_PAUSE_SCALE)),
  }));
}
