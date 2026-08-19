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
  /**
   * Base URL opcional del servicio remoto de voz argentina (`POST /v1/tts`).
   * Vacío por defecto en local. El build de Pages usa
   * https://pausa-mia-voz-ar.fly.dev. Sólo se usa tras consentimiento explícito
   * en la UI cuando Piper local no está disponible o falla.
   */
  readonly VITE_ARGENTINE_TTS_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
