// Adaptador de motores de voz.
//
// Hay tres motores posibles:
// 1. `web-speech`: la Web Speech API del navegador. Funciona en la mayoría de
//    navegadores/dispositivos modernos, pero la lista de voces (y si existe
//    una voz es-AR real) depende totalmente del sistema operativo instalado.
// 2. `neural-piper-es-ar`: una voz neuronal es_AR real (`es_AR-daniela-high`
//    de `rhasspy/piper-voices`) ejecutada en el navegador vía
//    WebAssembly/ONNX Runtime Web (`onnxruntime-web`), con el modelo cargado
//    de forma diferida (sólo tras un gesto explícito de la persona) y
//    cacheado localmente (Cache Storage) para no repetir la descarga. La
//    inferencia real vive en `piperEngine.ts`; este archivo resuelve URLs,
//    detecta soporte del navegador, descarga con progreso y cancelación, y
//    expone un único punto de síntesis que nunca degrada a otra variante en
//    silencio. Reproduce el WAV resultante con HTMLAudioElement (no requiere
//    AudioContext).
// 3. `remote-wav-es-ar`: opt-in a un endpoint propio que devuelve audio/wav.
//    La detección de soporte es sólo de reproducción local (HTMLAudioElement);
//    nunca se hace un request automático para “probar disponibilidad”.
//
// Sobre el mirror `diffusionstudio/piper-voices` (el que usa internamente
// `@mintplex-labs/piper-tts-web`): se verificó (`HEAD`/API de Hugging Face) el
// 2026-08-19 que ese repositorio **no contiene la carpeta `es/es_AR`** (la API
// devuelve `es/es_AR does not exist on "main"`). Por eso no se usa como base:
// no es un problema de mapeo de rutas, el archivo simplemente no está
// publicado ahí. `rhasspy/piper-voices` sí contiene
// `es/es_AR/daniela/high/es_AR-daniela-high.onnx` (confirmado con `HEAD`,
// 114.199.011 bytes) y es la fuente que se usa por defecto.

import {
  fetchWithProgress,
  loadOnnxRuntime,
  loadPiperPhonemizeFactory,
  phonemizeChunk,
  synthesizeWithSession,
  type OrtLike,
  type OrtSessionLike,
  type PiperModelConfig,
  type Progress,
  type ProgressCallback,
} from './piperEngine';
import { isRemoteArgentineTtsConfigured } from './remoteVoiceService';

export type { Progress };

export type VoiceEngineId = 'web-speech' | 'neural-piper-es-ar' | 'remote-wav-es-ar';

export interface VoiceEngineStatus {
  id: VoiceEngineId;
  name: string;
  description: string;
  /** El navegador/dispositivo tiene las APIs necesarias. */
  supported: boolean;
  /** Hay una URL de modelo configurada (por defecto o por variable de entorno). */
  configured: boolean;
  /**
   * Verdadero sólo si, en esta sesión de navegador, la inferencia produjo
   * realmente un `Blob` de audio (ver `markNeuralVoiceVerified`). Una URL que
   * responde a `HEAD` NO alcanza para marcar este motor como disponible.
   * El motor remoto nunca se marca disponible por tener endpoint: requiere
   * consentimiento y síntesis real.
   */
  available: boolean;
  /** Explicación honesta en español para mostrar en la interfaz. */
  reason: string;
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function checkWebSpeechEngineSupport(): boolean {
  return (
    hasWindow() && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  );
}

/**
 * Capacidades del navegador necesarias para Piper local: el modelo se descarga
 * con fetch, se cachea, se decodifica el JSON de config y se ejecuta vía
 * WebAssembly/ONNX. La salida es un WAV reproducido con HTMLAudioElement;
 * AudioContext no interviene en inferencia ni en reproducción, así que no es
 * un requisito.
 */
export function checkNeuralEngineBrowserSupport(): boolean {
  if (!hasWindow()) return false;
  const hasWebAssembly = typeof WebAssembly !== 'undefined';
  const hasCaches = 'caches' in window;
  const hasFetch = typeof fetch !== 'undefined';
  const hasTextDecoder = typeof TextDecoder !== 'undefined';
  const hasHtmlAudio =
    typeof HTMLAudioElement !== 'undefined' || typeof Audio !== 'undefined';
  return hasWebAssembly && hasCaches && hasFetch && hasTextDecoder && hasHtmlAudio;
}

/**
 * Detección separada (y testeable) de reproducción de WAV remoto vía
 * HTMLAudioElement. No hace requests al endpoint: sólo mira APIs del
 * navegador. Un `canPlayType` vacío no se trata como fallo duro (Safari a
 * veces reporta vacío para audio/wav aunque luego reproduzca el blob).
 */
export function checkRemoteWavPlaybackSupport(): boolean {
  if (!hasWindow()) return false;
  if (typeof Audio === 'undefined' && typeof HTMLAudioElement === 'undefined') {
    return false;
  }
  try {
    const probe =
      typeof Audio !== 'undefined' ? new Audio() : document.createElement('audio');
    if (typeof probe.canPlayType !== 'function') return true;
    const wav = probe.canPlayType('audio/wav') || probe.canPlayType('audio/x-wav');
    // CanPlayTypeResult es "" | "maybe" | "probably". Vacío = desconocido (p. ej.
    // Safari); no lo tratamos como incompatibilidad dura.
    return wav === '' || wav === 'maybe' || wav === 'probably';
  } catch {
    return false;
  }
}

/**
 * Identificador de voz Piper (mismo formato que `PATH_MAP` de
 * `@mintplex-labs/piper-tts-web`/`@diffusionstudio/vits-web`) y ruta relativa
 * dentro del repositorio `piper-voices`. Se documentan explícitamente para
 * que agregar otra voz en el futuro sea un cambio de una línea.
 */
export const PIPER_ES_AR_VOICE_ID = 'es_AR-daniela-high';
export const PIPER_ES_AR_VOICE_PATH = 'es/es_AR/daniela/high/es_AR-daniela-high.onnx';

/**
 * URL pública versionada del modelo `es_AR-daniela-high` en
 * `rhasspy/piper-voices` (Hugging Face). Se usa como valor por defecto
 * porque es el único modelo es-AR real y verificado (ver nota de arriba sobre
 * `diffusionstudio/piper-voices`); puede sobreescribirse con
 * `VITE_PIPER_ES_AR_VOICE_URL` (por ejemplo para servir el archivo desde un
 * CDN propio).
 */
export const DEFAULT_ES_AR_VOICE_URL = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${PIPER_ES_AR_VOICE_PATH}`;
export const DEFAULT_ES_AR_VOICE_CONFIG_URL = `${DEFAULT_ES_AR_VOICE_URL}.json`;

/** Tamaño real del `.onnx` (114.199.011 bytes, verificado con `HEAD` el 2026-08-19). */
export const ES_AR_VOICE_APPROX_SIZE_MB = 114;

/**
 * Licencia real del dataset entrenado (`MODEL_CARD`, rhasspy/piper-voices):
 * Creative Commons Attribution-ShareAlike 4.0, dataset OpenSLR #61. No es
 * MIT: cualquier redistribución del audio generado debe atribuir la fuente y
 * mantener la misma licencia. El código de Piper (motor) sí es MIT, pero eso
 * no cambia la licencia del modelo/voz en sí.
 */
export const ES_AR_VOICE_LICENSE =
  'CC BY-SA 4.0 (dataset OpenSLR #61, vía rhasspy/piper-voices)';

function readEnvUrl(key: string): string | null {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getNeuralVoiceModelUrl(): string {
  return readEnvUrl('VITE_PIPER_ES_AR_VOICE_URL') ?? DEFAULT_ES_AR_VOICE_URL;
}

export function getNeuralVoiceConfigUrl(): string {
  return (
    readEnvUrl('VITE_PIPER_ES_AR_VOICE_CONFIG_URL') ?? DEFAULT_ES_AR_VOICE_CONFIG_URL
  );
}

const NEURAL_MODEL_CACHE_NAME = 'meditacion-piper-voice-cache-v1';

/**
 * Verifica (sin descargar el archivo completo) si el recurso configurado
 * responde. Usa `HEAD` con timeout corto. Esto es sólo una señal informativa
 * previa; nunca se usa para marcar el motor neuronal como "disponible" (ver
 * `VoiceEngineStatus.available`), porque un `HEAD` exitoso no prueba que la
 * inferencia real vaya a funcionar en este dispositivo.
 */
export async function isNeuralVoiceModelReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function getFromCache(url: string): Promise<ArrayBuffer | null> {
  if (!hasWindow() || !('caches' in window)) return null;
  try {
    const cache = await caches.open(NEURAL_MODEL_CACHE_NAME);
    const cached = await cache.match(url);
    if (!cached) return null;
    return await cached.arrayBuffer();
  } catch {
    return null;
  }
}

async function putInCache(url: string, buffer: ArrayBuffer): Promise<void> {
  if (!hasWindow() || !('caches' in window)) return;
  try {
    const cache = await caches.open(NEURAL_MODEL_CACHE_NAME);
    await cache.put(url, new Response(buffer.slice(0)));
  } catch {
    // El cacheo es una optimización; si falla, seguimos sin caché.
  }
}

/**
 * Carga un recurso con caché local (Cache Storage) para evitar repetir la
 * descarga en sesiones futuras. Sólo se invoca cuando la persona elige
 * explícitamente el motor neuronal (botón "Preparar voz argentina"); nunca
 * se ejecuta automáticamente ni durante el build.
 */
export async function loadAndCacheNeuralVoiceModel(
  url: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const cached = await getFromCache(url);
  if (cached) {
    onProgress?.({ loaded: cached.byteLength, total: cached.byteLength });
    return cached;
  }
  const buffer = await fetchWithProgress(url, onProgress, signal);
  await putInCache(url, buffer);
  return buffer;
}

export interface NeuralVoicePrepareResult {
  modelBuffer: ArrayBuffer;
  modelConfig: PiperModelConfig;
}

/**
 * Descarga (o recupera de caché) el modelo y su configuración. Es la función
 * que respalda el botón "Preparar voz argentina": progreso visible,
 * cancelable y no bloqueante para el resto de la interfaz. No alcanza para
 * marcar el motor como disponible: eso requiere una síntesis real exitosa
 * (ver `synthesizeArgentineVoice`).
 */
export async function prepareNeuralVoice(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<NeuralVoicePrepareResult> {
  if (!checkNeuralEngineBrowserSupport()) {
    throw new Error(
      'Este navegador no soporta WebAssembly, Cache Storage, TextDecoder o reproducción WAV (HTMLAudioElement), necesarios para la voz argentina neuronal local.',
    );
  }

  const configUrl = getNeuralVoiceConfigUrl();
  const modelUrl = getNeuralVoiceModelUrl();

  const configBuffer = await loadAndCacheNeuralVoiceModel(configUrl, undefined, signal);
  const modelConfig = JSON.parse(
    new TextDecoder().decode(configBuffer),
  ) as PiperModelConfig;

  const modelBuffer = await loadAndCacheNeuralVoiceModel(modelUrl, onProgress, signal);

  return { modelBuffer, modelConfig };
}

let cachedSession: {
  ort: OrtLike;
  session: OrtSessionLike;
  modelConfig: PiperModelConfig;
} | null = null;

/**
 * Verdadero sólo después de que `synthesizeArgentineVoice` produjo
 * realmente un `Blob` de audio en esta sesión de navegador (pestaña). Se usa
 * para que `getVoiceEngineStatuses` nunca afirme "disponible" a partir de un
 * `HEAD` exitoso u otra señal indirecta.
 */
let verifiedInSession = false;

function markNeuralVoiceVerified(): void {
  verifiedInSession = true;
}

export function hasVerifiedNeuralVoiceInSession(): boolean {
  return verifiedInSession;
}

/** Sólo para pruebas: limpia la verificación de voz neuronal de la sesión. */
export function resetNeuralVoiceVerificationForTests(): void {
  verifiedInSession = false;
}

/**
 * Sintetiza texto con la voz argentina neuronal real. Lanza un error
 * explícito (con causa legible) si el modelo o el runtime no pudieron
 * cargarse; nunca cae a otra voz de forma silenciosa. Quien llama decide qué
 * hacer con el error (por ejemplo, ofrecer la voz del dispositivo con
 * confirmación explícita). Sólo marca el motor como "disponible" cuando esta
 * función efectivamente devuelve un `Blob`.
 */
export async function synthesizeArgentineVoice(
  text: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!cachedSession) {
    const { modelBuffer, modelConfig } = await prepareNeuralVoice(onProgress, signal);
    const ort = await loadOnnxRuntime();
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
    });
    cachedSession = { ort, session, modelConfig };
  }

  const { ort, session, modelConfig } = cachedSession;
  const blob = await synthesizeWithSession(text, {
    ort,
    ortSession: session,
    modelConfig,
    phonemize: (chunk, espeakVoice) => phonemizeChunk(chunk, espeakVoice),
  });
  markNeuralVoiceVerified();
  return blob;
}

/** Sólo para pruebas: limpia la sesión cacheada de inferencia neuronal. */
export function resetArgentineVoiceSessionForTests(): void {
  cachedSession = null;
}

export async function getVoiceEngineStatuses(): Promise<VoiceEngineStatus[]> {
  const webSpeechSupported = checkWebSpeechEngineSupport();
  const neuralBrowserSupported = checkNeuralEngineBrowserSupport();
  const remotePlaybackSupported = checkRemoteWavPlaybackSupport();
  const remoteConfigured = isRemoteArgentineTtsConfigured();

  const webSpeechStatus: VoiceEngineStatus = {
    id: 'web-speech',
    name: 'Motor local por reglas (Web Speech API)',
    description:
      'Usa las voces instaladas en tu navegador o sistema operativo. Funciona sin conexión ni claves, pero la voz argentina real depende de las voces que tenga tu dispositivo.',
    supported: webSpeechSupported,
    configured: true,
    available: webSpeechSupported,
    reason: webSpeechSupported
      ? 'Disponible: tu navegador ofrece síntesis de voz nativa.'
      : 'No disponible: este navegador no implementa la Web Speech API.',
  };

  let neuralReason: string;
  if (!neuralBrowserSupported) {
    neuralReason =
      'No compatible: tu navegador no soporta WebAssembly, Cache Storage, TextDecoder o reproducción WAV (HTMLAudioElement), requeridos para Piper local. Probá con un navegador moderno (Chrome, Edge, Safari o Firefox actualizados).';
  } else if (verifiedInSession) {
    neuralReason =
      'Verificada en esta sesión: la síntesis produjo audio real con el modelo es_AR-daniela-high.';
  } else {
    neuralReason = `Configurada pero aún no verificada en este dispositivo (descarga de aprox. ${ES_AR_VOICE_APPROX_SIZE_MB} MB, sólo al presionar "Preparar voz argentina" en el paso de reproducción; queda en caché local luego).`;
  }

  const neuralStatus: VoiceEngineStatus = {
    id: 'neural-piper-es-ar',
    name: 'Voz argentina neuronal (Piper/ONNX, es_AR-daniela-high)',
    description:
      'Voz argentina real generada por un modelo neuronal ejecutado en el navegador (WebAssembly/ONNX Runtime Web), con carga diferida y caché. No es una grabación pregrabada ni una voz es-MX/es-ES presentada como argentina.',
    supported: neuralBrowserSupported,
    configured: true,
    available: neuralBrowserSupported && verifiedInSession,
    reason: neuralReason,
  };

  let remoteReason: string;
  if (!remotePlaybackSupported) {
    remoteReason =
      'No compatible: este navegador no puede reproducir WAV con HTMLAudioElement.';
  } else if (!remoteConfigured) {
    remoteReason =
      'Sin endpoint: definí VITE_ARGENTINE_TTS_ENDPOINT para habilitar la ruta remota opt-in. No se hace ninguna petición automática.';
  } else {
    remoteReason =
      'Endpoint configurado; requiere consentimiento y síntesis. No se verifica disponibilidad con requests automáticos.';
  }

  const remoteStatus: VoiceEngineStatus = {
    id: 'remote-wav-es-ar',
    name: 'Voz argentina remota (WAV vía endpoint propio)',
    description:
      'Opt-in: un servidor propio sintetiza el texto del guion y devuelve audio/wav. Sólo se activa tras consentimiento explícito; no envía diario, perfil ni fuentes.',
    supported: remotePlaybackSupported,
    configured: remoteConfigured,
    // Nunca "disponible" sólo por tener endpoint: eso implicaría una
    // verificación que no ocurrió (no hay HEAD/ping automático).
    available: false,
    reason: remoteReason,
  };

  return [webSpeechStatus, neuralStatus, remoteStatus];
}

export { loadPiperPhonemizeFactory };
