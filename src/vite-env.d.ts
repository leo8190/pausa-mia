/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL opcional a un modelo de voz neuronal es-AR en formato Piper/ONNX
   * (por ejemplo `es_AR-daniela-high.onnx`), servido por quien despliega el
   * sitio. Sin esta variable, el motor neuronal se declara no disponible.
   */
  readonly VITE_PIPER_ES_AR_VOICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
