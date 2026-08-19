/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL opcional al modelo `.onnx` de la voz argentina neuronal
   * (`es_AR-daniela-high`, Piper/ONNX). Sin esta variable se usa la URL
   * pública por defecto de `rhasspy/piper-voices` en Hugging Face
   * (ver `DEFAULT_ES_AR_VOICE_URL` en `voiceEngine.ts`).
   */
  readonly VITE_PIPER_ES_AR_VOICE_URL?: string;
  /**
   * URL opcional a la configuración `.onnx.json` correspondiente. Sin esta
   * variable se usa la URL pública por defecto equivalente.
   */
  readonly VITE_PIPER_ES_AR_VOICE_CONFIG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
