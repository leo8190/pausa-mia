// Adaptador propio de síntesis de voz Piper (WebAssembly/ONNX Runtime Web)
// para una voz argentina real (es_AR-daniela-high, rhasspy/piper-voices,
// licencia MIT). No usamos el mapeo interno (`PATH_MAP`) del paquete
// `@mintplex-labs/piper-tts-web@1.0.5`: esa versión no incluye `es_AR` en su
// lista fija de voces y su URL base está fijada a un espejo de terceros. En
// su lugar, este adaptador acepta cualquier URL de modelo `.onnx` y de
// configuración `.onnx.json`, resuelta por `voiceEngine.ts` (por defecto la
// URL pública de Hugging Face de `rhasspy/piper-voices`, sobreescribible por
// variables de entorno). Esto es más mantenible que parchear un objeto
// interno de una dependencia de terceros.
//
// Reutiliza los mismos binarios WASM públicos que `piper-tts-web` (ONNX
// Runtime Web vía `onnxruntime-web/wasm`, fonemizador Piper vía
// `@diffusionstudio/piper-wasm`, ambos MIT), sin empaquetarlos en el build:
// se cargan bajo demanda desde CDN, igual que el modelo de voz.

export interface Progress {
  loaded: number;
  total: number;
}

export type ProgressCallback = (progress: Progress) => void;

export const ONNX_RUNTIME_WASM_BASE_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
export const PIPER_PHONEMIZE_WASM_JS_URL =
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.js';
export const PIPER_PHONEMIZE_WASM_BINARY_URL =
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm';
export const PIPER_PHONEMIZE_DATA_URL =
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data';

const MAX_CHUNK_LENGTH = 400;

export interface PiperModelConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  speaker_id_map: Record<string, number>;
}

/** Divide texto largo en fragmentos, respetando límites de frase cuando es posible. */
export function splitIntoChunks(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLength) return [trimmed];

  const sentences = trimmed.match(/[^.!?…\n]+[.!?…]*\s*/g) ?? [trimmed];
  const chunks: string[] = [];
  let current = '';
  const pushCurrent = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = '';
  };
  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength) pushCurrent();
    if (sentence.length > maxLength) {
      let piece = '';
      for (const word of sentence.split(/\s+/)) {
        if ((piece + ' ' + word).trim().length > maxLength) {
          const p = piece.trim();
          if (p) chunks.push(p);
          piece = word;
        } else {
          piece = piece ? `${piece} ${word}` : word;
        }
      }
      current = piece;
    } else {
      current += sentence;
    }
  }
  pushCurrent();
  return chunks;
}

/** Convierte PCM float32 mono en un WAV listo para reproducir. */
export function pcmToWav(
  buffer: Float32Array | number[],
  sampleRate: number,
  numChannels = 1,
): ArrayBuffer {
  const pcm = buffer instanceof Float32Array ? buffer : Float32Array.from(buffer);
  const bufferLength = pcm.length;
  const headerLength = 44;
  const view = new DataView(
    new ArrayBuffer(bufferLength * numChannels * 2 + headerLength),
  );
  view.setUint32(0, 0x46464952, true); // 'RIFF'
  view.setUint32(4, view.buffer.byteLength - 8, true);
  view.setUint32(8, 0x45564157, true); // 'WAVE'
  view.setUint32(12, 0x20746d66, true); // 'fmt '
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, numChannels * 2 * sampleRate, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true); // 'data'
  view.setUint32(40, 2 * bufferLength, true);
  let p = headerLength;
  for (let i = 0; i < bufferLength; i++) {
    const v = pcm[i];
    if (v >= 1) view.setInt16(p, 32767, true);
    else if (v <= -1) view.setInt16(p, -32768, true);
    else view.setInt16(p, (v * 32768) | 0, true);
    p += 2;
  }
  return view.buffer;
}

/**
 * Descarga un recurso reportando progreso y permitiendo cancelación. No
 * cachea por sí solo; quien llama decide si guarda el resultado.
 */
export async function fetchWithProgress(
  url: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`No se pudo descargar ${url} (HTTP ${res.status})`);
  }
  const total = Number(res.headers.get('Content-Length') ?? 0);
  const reader = res.body?.getReader();
  if (!reader) {
    return res.arrayBuffer();
  }
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({ loaded, total });
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged.buffer;
}

/**
 * Carga el fonemizador Piper (Emscripten/WASM) como script clásico, ya que
 * el build publicado no expone exportaciones ES module. Expone
 * `createPiperPhonemize` como global una sola vez por sesión de navegador.
 */
export async function loadPiperPhonemizeFactory(
  scriptUrl: string = PIPER_PHONEMIZE_WASM_JS_URL,
): Promise<(moduleArg?: Record<string, unknown>) => Promise<PiperPhonemizeModule>> {
  const globalScope = globalThis as unknown as {
    createPiperPhonemize?: (
      moduleArg?: Record<string, unknown>,
    ) => Promise<PiperPhonemizeModule>;
  };
  if (globalScope.createPiperPhonemize) {
    return globalScope.createPiperPhonemize;
  }
  if (typeof document === 'undefined') {
    throw new Error(
      'El fonemizador de Piper requiere un documento HTML (navegador), no está disponible en este entorno.',
    );
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`No se pudo cargar el fonemizador de Piper desde ${scriptUrl}`));
    document.head.appendChild(script);
  });
  if (!globalScope.createPiperPhonemize) {
    throw new Error(
      'El fonemizador de Piper se cargó pero no expuso su función esperada.',
    );
  }
  return globalScope.createPiperPhonemize;
}

export interface PiperPhonemizeModule {
  callMain(args: string[]): void;
}

/** Fonemiza un fragmento de texto usando espeak-ng vía WASM y devuelve los phoneme_ids. */
export async function phonemizeChunk(
  text: string,
  espeakVoice: string,
  wasmPaths: { wasmBinary: string; wasmData: string } = {
    wasmBinary: PIPER_PHONEMIZE_WASM_BINARY_URL,
    wasmData: PIPER_PHONEMIZE_DATA_URL,
  },
  factory?: (moduleArg?: Record<string, unknown>) => Promise<PiperPhonemizeModule>,
): Promise<number[]> {
  const createPiperPhonemize = factory ?? (await loadPiperPhonemizeFactory());
  const input = JSON.stringify([{ text: text.trim() }]);
  return new Promise<number[]>((resolve, reject) => {
    void createPiperPhonemize({
      print: (data: string) => {
        try {
          resolve(JSON.parse(data).phoneme_ids as number[]);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      printErr: (message: string) => reject(new Error(message)),
      locateFile: (url: string) => {
        if (url.endsWith('.wasm')) return wasmPaths.wasmBinary;
        if (url.endsWith('.data')) return wasmPaths.wasmData;
        return url;
      },
    }).then((module) => {
      module.callMain([
        '-l',
        espeakVoice,
        '--input',
        input,
        '--espeak_data',
        '/espeak-ng-data',
      ]);
    }, reject);
  });
}

/** Interfaz mínima de ONNX Runtime que usamos, para poder mockearla en pruebas. */
export interface OrtLike {
  env?: {
    wasm?: { numThreads?: number; wasmPaths?: string };
    allowLocalModels?: boolean;
  };
  InferenceSession: {
    create(
      buffer: ArrayBuffer,
      options?: Record<string, unknown>,
    ): Promise<OrtSessionLike>;
  };
  Tensor: new (type: string, data: unknown, dims?: number[]) => unknown;
}

export interface OrtSessionLike {
  run(feeds: Record<string, unknown>): Promise<{ output: { data: Float32Array } }>;
}

export async function loadOnnxRuntime(
  wasmPathsBase: string = ONNX_RUNTIME_WASM_BASE_URL,
): Promise<OrtLike> {
  const ortModule = (await import('onnxruntime-web/wasm')) as unknown as {
    default?: OrtLike;
  } & OrtLike;
  const ort = (ortModule.default ?? ortModule) as OrtLike;
  if (ort.env) {
    if (ort.env.wasm) {
      ort.env.wasm.numThreads =
        typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1;
      ort.env.wasm.wasmPaths = wasmPathsBase;
    }
    if ('allowLocalModels' in ort.env) {
      ort.env.allowLocalModels = false;
    }
  }
  return ort;
}

export interface PiperSessionDeps {
  ort: OrtLike;
  ortSession: OrtSessionLike;
  modelConfig: PiperModelConfig;
  phonemize: (text: string, espeakVoice: string) => Promise<number[]>;
}

/**
 * Ejecuta la inferencia real de Piper para un texto ya cargado el modelo y
 * el fonemizador. Separado de la carga de red para poder probarse con
 * dependencias inyectadas (mock de ONNX Runtime y fonemizador).
 */
export async function synthesizeWithSession(
  text: string,
  deps: PiperSessionDeps,
): Promise<Blob> {
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    throw new Error('No hay texto para sintetizar.');
  }

  const { ort, ortSession, modelConfig, phonemize } = deps;
  const speakerId = 0;
  const pcms: Float32Array[] = [];

  for (const chunk of chunks) {
    const phonemeIds = await phonemize(chunk, modelConfig.espeak.voice);
    const feeds: Record<string, unknown> = {
      input: new ort.Tensor('int64', phonemeIds, [1, phonemeIds.length]),
      input_lengths: new ort.Tensor('int64', [phonemeIds.length]),
      scales: new ort.Tensor('float32', [
        modelConfig.inference.noise_scale,
        modelConfig.inference.length_scale,
        modelConfig.inference.noise_w,
      ]),
    };
    if (Object.keys(modelConfig.speaker_id_map ?? {}).length > 0) {
      feeds.sid = new ort.Tensor('int64', [speakerId]);
    }
    const { output } = await ortSession.run(feeds);
    pcms.push(output.data);
  }

  const totalLength = pcms.reduce((sum, pcm) => sum + pcm.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const pcm of pcms) {
    merged.set(pcm, offset);
    offset += pcm.length;
  }

  return new Blob([pcmToWav(merged, modelConfig.audio.sample_rate)], {
    type: 'audio/x-wav',
  });
}
