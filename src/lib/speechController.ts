const cancelCallbacks = new Set<() => void>();

/**
 * Registra un cancelador de reproducción activa (Web Speech o HTMLAudioElement
 * de la sesión argentina). Varios motores pueden coexistir en PlaybackStep;
 * el borrado de sesión debe detenerlos a todos.
 */
export function registerSpeechCancel(fn: () => void): () => void {
  cancelCallbacks.add(fn);
  return () => {
    cancelCallbacks.delete(fn);
  };
}

export function cancelActiveSpeech(): void {
  for (const fn of [...cancelCallbacks]) {
    try {
      fn();
    } catch {
      // Un motor no debe impedir cancelar el resto.
    }
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** Sólo para pruebas: cantidad de canceladores registrados. */
export function getRegisteredSpeechCancelCount(): number {
  return cancelCallbacks.size;
}
