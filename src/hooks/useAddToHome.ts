import { useCallback, useEffect, useState } from 'react';

/** Minimal typing for the non-standard beforeinstallprompt event. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type AddToHomeState = {
  canPrompt: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<boolean>;
  hint: string | null;
};

export const ADD_TO_HOME_HINT =
  'En el menú del navegador podés "Agregar a inicio" o "Instalar".';

export function isRunningAsInstalledPwa(
  win: Window = typeof window !== 'undefined' ? window : (undefined as unknown as Window),
): boolean {
  if (!win) return false;
  try {
    if (win.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* matchMedia may throw in odd environments */
  }
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

/**
 * Captures beforeinstallprompt when available and exposes a small install UX.
 * No service worker required — browsers may still fire the event with a manifest.
 */
export function useAddToHome(): AddToHomeState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isRunningAsInstalledPwa());

  useEffect(() => {
    setIsInstalled(isRunningAsInstalledPwa());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferred(null);
    };

    const syncInstalled = () => setIsInstalled(isRunningAsInstalledPwa());

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(display-mode: standalone)');
      mq.addEventListener?.('change', syncInstalled);
    } catch {
      mq = null;
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', syncInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }
      return false;
    } catch {
      setDeferred(null);
      return false;
    }
  }, [deferred]);

  const canPrompt = !isInstalled && deferred !== null;
  const hint = !isInstalled && !canPrompt ? ADD_TO_HOME_HINT : null;

  return { canPrompt, isInstalled, promptInstall, hint };
}
