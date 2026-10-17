import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADD_TO_HOME_HINT,
  isRunningAsInstalledPwa,
  useAddToHome,
  type BeforeInstallPromptEvent,
} from '../hooks/useAddToHome';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches,
    media: '(display-mode: standalone)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.delete(cb);
    }),
    dispatchEvent: vi.fn(),
    _emit() {
      listeners.forEach((cb) => cb());
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => {
      if (query === '(display-mode: standalone)') return mq;
      return {
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      };
    }),
  );
  return mq;
}

function makeBeforeInstallEvent(): BeforeInstallPromptEvent {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const userChoice = Promise.resolve({
    outcome: 'accepted' as const,
    platform: 'web',
  });
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
  Object.defineProperty(event, 'prompt', { value: prompt });
  Object.defineProperty(event, 'userChoice', { value: userChoice });
  return event;
}

describe('isRunningAsInstalledPwa', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'standalone');
  });

  it('detecta display-mode standalone', () => {
    stubMatchMedia(true);
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('detecta navigator.standalone (iOS)', () => {
    stubMatchMedia(false);
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true,
    });
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('es false en navegador normal', () => {
    stubMatchMedia(false);
    expect(isRunningAsInstalledPwa()).toBe(false);
  });
});

describe('useAddToHome', () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'standalone');
    vi.restoreAllMocks();
  });

  it('sin beforeinstallprompt: hint honesto y canPrompt false', () => {
    const { result } = renderHook(() => useAddToHome());
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.hint).toBe(ADD_TO_HOME_HINT);
  });

  it('cuando beforeinstallprompt dispara: canPrompt true y promptInstall llama prompt()', async () => {
    const { result } = renderHook(() => useAddToHome());
    const bip = makeBeforeInstallEvent();

    await act(async () => {
      window.dispatchEvent(bip);
    });

    expect(result.current.canPrompt).toBe(true);
    expect(result.current.hint).toBeNull();
    expect(result.current.isInstalled).toBe(false);

    let accepted = false;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(bip.prompt).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(true);
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.isInstalled).toBe(true);
  });

  it('en display-mode standalone: isInstalled true y sin hint de instalación', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useAddToHome());
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.hint).toBeNull();
  });
});
