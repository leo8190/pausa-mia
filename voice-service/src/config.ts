export interface VoiceServiceConfig {
  port: number;
  allowedOrigins: string[];
  requireOrigin: boolean;
  backend: 'mock' | 'piper';
  piperBin: string;
  modelPath: string;
  configPath: string;
  maxTextChars: number;
  ttsRateLimitPerMinute: number;
  /**
   * Multiplicador Piper length_scale (>1 = más lento). Alineado con
   * SERENE_CADENCE_SCALE del cliente (~1.28) para guiadas calmadas.
   */
  lengthScale: number;
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/** Cadencia serena por defecto (mismo factor que Piper local en el cliente). */
export const DEFAULT_ARGENTINE_LENGTH_SCALE = 1.28;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): VoiceServiceConfig {
  const backendRaw = (env.ARG_TTS_BACKEND ?? 'piper').toLowerCase();
  const backend = backendRaw === 'mock' ? 'mock' : 'piper';
  const maxTextChars = Number.parseInt(env.ARG_MAX_TEXT_CHARS ?? '800', 10);
  const ttsRateLimitPerMinute = Number.parseInt(
    env.ARG_TTS_RATE_LIMIT_PER_MINUTE ?? '30',
    10,
  );
  const lengthScaleRaw = Number.parseFloat(
    env.ARG_TTS_LENGTH_SCALE ?? String(DEFAULT_ARGENTINE_LENGTH_SCALE),
  );
  const lengthScale =
    Number.isFinite(lengthScaleRaw) && lengthScaleRaw >= 0.5 && lengthScaleRaw <= 3
      ? lengthScaleRaw
      : DEFAULT_ARGENTINE_LENGTH_SCALE;

  return {
    port: Number.parseInt(env.PORT ?? '8787', 10) || 8787,
    allowedOrigins: parseOrigins(env.ARG_ALLOWED_ORIGINS),
    requireOrigin: parseBoolean(env.ARG_REQUIRE_ORIGIN, false),
    backend,
    piperBin: env.PIPER_BIN ?? 'piper',
    modelPath: env.PIPER_MODEL_PATH ?? './models/es_AR-daniela-high.onnx',
    configPath: env.PIPER_CONFIG_PATH ?? './models/es_AR-daniela-high.onnx.json',
    maxTextChars: Number.isFinite(maxTextChars) && maxTextChars > 0 ? maxTextChars : 800,
    ttsRateLimitPerMinute:
      Number.isFinite(ttsRateLimitPerMinute) && ttsRateLimitPerMinute > 0
        ? ttsRateLimitPerMinute
        : 30,
    lengthScale,
  };
}
