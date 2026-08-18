let cancelCallback: (() => void) | null = null;

export function registerSpeechCancel(fn: () => void): () => void {
  cancelCallback = fn;
  return () => {
    if (cancelCallback === fn) cancelCallback = null;
  };
}

export function cancelActiveSpeech(): void {
  cancelCallback?.();
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
