/**
 * Reexportaciones de cadencia serena.
 * Fuentes canónicas: `piperEngine` (Piper) y `voiceService` (Web Speech).
 */

export {
  SERENE_CADENCE_SCALE as MEDITATION_LENGTH_SCALE,
  resolveSereneLengthScale as resolvePiperLengthScale,
} from './piperEngine';

export { CALM_SPEECH_RATE as MEDITATION_SPEECH_RATE } from './voiceService';

/** Rate histórico de Web Speech antes del ajuste de cadencia calma. */
export const BASE_WEB_SPEECH_RATE = 0.9;
