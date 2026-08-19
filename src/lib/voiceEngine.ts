// Adaptador de motores de voz.
//
// Hay dos motores posibles:
// 1. `web-speech`: la Web Speech API del navegador. Funciona en la mayoría de
//    navegadores/dispositivos modernos, pero la lista de voces (y si existe
//    una voz es-AR real) depende totalmente del sistema operativo instalado.
// 2. `neural-piper-es-ar`: una voz neuronal es_AR (por ejemplo
//    `es_AR-daniela-high` de Piper) ejecutada en el navegador vía
//    WebAssembly/ONNX Runtime Web, con el modelo cargado de forma diferida y
//    cacheado localmente (Cache Storage) para no repetir la descarga.
//
// Este archivo define el contrato y la detección de disponibilidad de ambos
// motores. El motor neuronal **no viene activado por defecto**: este
// prototipo no incluye ni descarga ningún binario de modelo (los pesos de
// `es_AR-daniela-high` pesan decenas de MB y requieren decidir hosting y
// licencia antes de distribuirlos). Declarar `VITE_PIPER_ES_AR_VOICE_URL`
// apuntando a un modelo `.onnx` + `.onnx.json` propios es el único modo de
// activarlo; sin esa variable, `getVoiceEngineStatuses()` reporta
// honestamente que no está disponible en vez de simular que funciona.

export type VoiceEngineId = 'web-speech' | 'neural-piper-es-ar';

export interface VoiceEngineStatus {
  id: VoiceEngineId;
  name: string;
  description: string;
  /** El navegador/dispositivo tiene las APIs necesarias. */
  supported: boolean;
  /** Hay un modelo o recurso configurado para usarse (cuando aplica). */
  configured: boolean;
  /** `supported && configured`. Lo que la interfaz debería mostrar como usable. */
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
 * Capacidades del navegador necesarias para ejecutar un runtime WASM/ONNX de
 * síntesis de voz (Piper u otro) enteramente en el cliente.
 */
export function checkNeuralEngineBrowserSupport(): boolean {
  if (!hasWindow()) return false;
  const hasWebAssembly = typeof WebAssembly !== 'undefined';
  const audioCtor =
    (window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
  const hasAudioContext = typeof audioCtor !== 'undefined';
  const hasCaches = 'caches' in window;
  const hasFetch = typeof fetch !== 'undefined';
  return hasWebAssembly && hasAudioContext && hasCaches && hasFetch;
}

/**
 * URL configurada por quien despliega el sitio para el modelo es_AR (por
 * ejemplo `es_AR-daniela-high.onnx`). No se incluye ningún valor por
 * defecto: sin configuración explícita, el motor neuronal se declara no
 * disponible en lugar de intentar una descarga a un origen desconocido.
 */
export function getNeuralVoiceModelUrl(): string | null {
  const url = import.meta.env.VITE_PIPER_ES_AR_VOICE_URL;
  return typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
}

const NEURAL_MODEL_CACHE_NAME = 'meditacion-piper-voice-cache-v1';

/**
 * Verifica (sin descargar el archivo completo) si el recurso configurado
 * responde. Usa `HEAD` con timeout corto para no bloquear la interfaz.
 */
export async function isNeuralVoiceModelReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Carga el modelo neuronal con caché local (Cache Storage) para evitar
 * repetir la descarga en sesiones futuras. Sólo se invoca cuando la persona
 * elige explícitamente el motor neuronal y este está configurado y
 * disponible; nunca se ejecuta automáticamente en este prototipo.
 */
export async function loadAndCacheNeuralVoiceModel(url: string): Promise<ArrayBuffer> {
  if (!hasWindow() || !('caches' in window)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo cargar el modelo de voz (${res.status})`);
    return res.arrayBuffer();
  }

  const cache = await caches.open(NEURAL_MODEL_CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    return cached.arrayBuffer();
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar el modelo de voz (${res.status})`);
  await cache.put(url, res.clone());
  return res.arrayBuffer();
}

export async function getVoiceEngineStatuses(): Promise<VoiceEngineStatus[]> {
  const webSpeechSupported = checkWebSpeechEngineSupport();
  const neuralBrowserSupported = checkNeuralEngineBrowserSupport();
  const modelUrl = getNeuralVoiceModelUrl();

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
  let neuralAvailable = false;
  if (!neuralBrowserSupported) {
    neuralReason =
      'No disponible: tu navegador no soporta WebAssembly, AudioContext o Cache Storage, requeridos para ejecutar una voz neuronal en el cliente.';
  } else if (!modelUrl) {
    neuralReason =
      'No disponible en este build: no hay un modelo de voz es-AR (por ejemplo es_AR-daniela-high en formato Piper/ONNX) configurado ni distribuido con la aplicación. El adaptador está listo, pero no se simula una voz que no existe.';
  } else {
    const reachable = await isNeuralVoiceModelReachable(modelUrl);
    neuralAvailable = reachable;
    neuralReason = reachable
      ? 'Disponible: el modelo configurado respondió correctamente y se cargará en el navegador la primera vez que se use (con caché local).'
      : 'No disponible: el modelo configurado no respondió. Se usará el motor local por reglas.';
  }

  const neuralStatus: VoiceEngineStatus = {
    id: 'neural-piper-es-ar',
    name: 'Voz neuronal es-AR (Piper/ONNX, experimental)',
    description:
      'Voz argentina generada por un modelo neuronal ejecutado en el navegador (WebAssembly/ONNX Runtime Web), con carga diferida y caché. Requiere un modelo propio, mantenible y con licencia clara.',
    supported: neuralBrowserSupported,
    configured: modelUrl !== null,
    available: neuralAvailable,
    reason: neuralReason,
  };

  return [webSpeechStatus, neuralStatus];
}
