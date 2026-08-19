export interface VoiceServiceConfig {
  port: number;
  allowedOrigins: string[];
  backend: 'mock' | 'piper';
  piperBin: string;
  modelPath: string;
  configPath: string;
  maxTextChars: number;
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): VoiceServiceConfig {
  const backendRaw = (env.ARG_TTS_BACKEND ?? 'piper').toLowerCase();
  const backend = backendRaw === 'mock' ? 'mock' : 'piper';
  const maxTextChars = Number.parseInt(env.ARG_MAX_TEXT_CHARS ?? '800', 10);

  return {
    port: Number.parseInt(env.PORT ?? '8787', 10) || 8787,
    allowedOrigins: parseOrigins(env.ARG_ALLOWED_ORIGINS),
    backend,
    piperBin: env.PIPER_BIN ?? 'piper',
    modelPath: env.PIPER_MODEL_PATH ?? './models/es_AR-daniela-high.onnx',
    configPath: env.PIPER_CONFIG_PATH ?? './models/es_AR-daniela-high.onnx.json',
    maxTextChars: Number.isFinite(maxTextChars) && maxTextChars > 0 ? maxTextChars : 800,
  };
}
