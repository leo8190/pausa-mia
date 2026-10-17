import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GUEST_PROGRESS_KEY,
  clearGuestProgress,
  hasGuestProgress,
  loadGuestProgress,
  sanitizeGuestStep,
  saveGuestProgress,
} from '../lib/guestProgressStorage';
import {
  applyGuestProgress,
  clearSession,
  createBlankCheckIn,
  createInitialSession,
} from '../lib/session';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSession } from '../hooks/useSession';
import { vi } from 'vitest';
import { clearPreferences } from '../lib/preferencesStorage';

describe('guestProgressStorage', () => {
  beforeEach(() => {
    clearGuestProgress();
    clearPreferences();
  });

  afterEach(() => {
    clearGuestProgress();
    clearPreferences();
  });

  it('guarda solo campos seguros y marca guest', () => {
    saveGuestProgress({
      duration: 3,
      voiceVariant: 'es-AR',
      intention: 'calmar-ritmo',
      style: 'respiracion-natural',
      moment: 'ahora',
      experience: 'primera-vez',
      step: 'checkin',
      meditationCompleted: false,
      meditationCount: 0,
    });

    const loaded = loadGuestProgress();
    expect(loaded).not.toBeNull();
    expect(loaded!.guest).toBe(true);
    expect(loaded!.duration).toBe(3);
    expect(loaded!.voiceVariant).toBe('es-AR');
    expect(loaded!.intention).toBe('calmar-ritmo');
    expect(loaded!.style).toBe('respiracion-natural');
    expect(loaded!.step).toBe('checkin');
    expect(hasGuestProgress()).toBe(true);

    const raw = JSON.parse(localStorage.getItem(GUEST_PROGRESS_KEY)!);
    expect(raw).not.toHaveProperty('recentSituation');
    expect(raw).not.toHaveProperty('name');
    expect(raw).not.toHaveProperty('script');
    expect(raw).not.toHaveProperty('avoidTopics');
    expect(raw).not.toHaveProperty('perceivedStateOther');
    expect(JSON.stringify(raw)).not.toMatch(/diario|hoy me sent/i);
  });

  it('rechaza payload sin marcador guest o duración inválida', () => {
    localStorage.setItem(
      GUEST_PROGRESS_KEY,
      JSON.stringify({ guest: false, duration: 5, voiceVariant: 'es-neutro' }),
    );
    expect(loadGuestProgress()).toBeNull();

    localStorage.setItem(
      GUEST_PROGRESS_KEY,
      JSON.stringify({ guest: true, duration: 99, voiceVariant: 'es-neutro' }),
    );
    expect(loadGuestProgress()).toBeNull();
  });

  it('sanitiza pasos que requieren guion a checkin o welcome', () => {
    expect(sanitizeGuestStep('playback')).toBe('checkin');
    expect(sanitizeGuestStep('review')).toBe('checkin');
    expect(sanitizeGuestStep('safety')).toBe('checkin');
    expect(sanitizeGuestStep('ai-consent')).toBe('checkin');
    expect(sanitizeGuestStep('deleted')).toBe('welcome');
    expect(sanitizeGuestStep('checkin')).toBe('checkin');
    expect(sanitizeGuestStep('feedback')).toBe('feedback');
  });

  it('clear elimina la clave', () => {
    saveGuestProgress({
      duration: 5,
      voiceVariant: 'es-neutro',
      intention: '',
      style: '',
      moment: '',
      experience: '',
      step: 'welcome',
      meditationCompleted: true,
      meditationCount: 2,
    });
    clearGuestProgress();
    expect(localStorage.getItem(GUEST_PROGRESS_KEY)).toBeNull();
    expect(hasGuestProgress()).toBe(false);
  });

  it('nunca persiste texto sensible aunque se inyecte en localStorage ajeno', () => {
    localStorage.setItem(
      GUEST_PROGRESS_KEY,
      JSON.stringify({
        guest: true,
        duration: 5,
        voiceVariant: 'es-neutro',
        intention: 'descansar',
        style: 'autocompasion',
        moment: 'ahora',
        experience: 'basica',
        step: 'checkin',
        meditationCompleted: false,
        meditationCount: 0,
        recentSituation: 'secreto personal',
        name: 'Ana',
        script: { fullText: 'no guardar' },
      }),
    );
    const loaded = loadGuestProgress();
    expect(loaded).not.toBeNull();
    expect(loaded as object).not.toHaveProperty('recentSituation');
    expect(loaded as object).not.toHaveProperty('name');
    expect(loaded as object).not.toHaveProperty('script');
  });
});

describe('applyGuestProgress / createInitialSession restore', () => {
  beforeEach(() => {
    clearGuestProgress();
    clearPreferences();
  });

  afterEach(() => {
    clearGuestProgress();
    clearPreferences();
  });

  it('rehidrata step y check-in seguro sin diario ni guion', () => {
    saveGuestProgress({
      duration: 10,
      voiceVariant: 'es-AR',
      intention: 'con-el-futuro',
      style: 'atencion-abierta',
      moment: 'pausa-laboral',
      experience: 'habitual',
      step: 'checkin',
      meditationCompleted: false,
      meditationCount: 1,
    });

    const session = createInitialSession();
    expect(session.step).toBe('checkin');
    expect(session.consent.sessionProcessing).toBe(true);
    expect(session.checkIn.duration).toBe(10);
    expect(session.checkIn.voiceVariant).toBe('es-AR');
    expect(session.checkIn.intention).toBe('con-el-futuro');
    expect(session.checkIn.style).toBe('atencion-abierta');
    expect(session.checkIn.moment).toBe('pausa-laboral');
    expect(session.checkIn.experience).toBe('habitual');
    expect(session.checkIn.name).toBe('');
    expect(session.checkIn.recentSituation).toBe('');
    expect(session.script).toBeNull();
    expect(session.contextSources.every((s) => !s.content.trim())).toBe(true);
  });

  it('clearSession no rehidrata progreso invitado', () => {
    saveGuestProgress({
      duration: 10,
      voiceVariant: 'es-AR',
      intention: 'descansar',
      style: 'autocompasion',
      moment: 'ahora',
      experience: 'basica',
      step: 'checkin',
      meditationCompleted: true,
      meditationCount: 3,
    });
    const cleared = clearSession();
    expect(cleared.checkIn).toEqual(createBlankCheckIn());
    expect(cleared.step).toBe('welcome');
    expect(cleared.consent.sessionProcessing).toBe(false);
  });

  it('applyGuestProgress es no-op sin storage', () => {
    const base = clearSession();
    expect(applyGuestProgress(base)).toEqual(base);
  });
});

describe('useSession guest progress persist / wipe', () => {
  beforeEach(() => {
    clearGuestProgress();
    clearPreferences();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aiEnabled: false }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearGuestProgress();
    clearPreferences();
  });

  it('persiste progreso al avanzar y lo restaura en un nuevo hook', async () => {
    const { result, unmount } = renderHook(() => useSession());
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    act(() => {
      result.current.updateConsent({ sessionProcessing: true });
      result.current.updateCheckIn({
        duration: 3,
        voiceVariant: 'es-AR',
        intention: 'calmar-ritmo',
        style: 'respiracion-natural',
        moment: 'ahora',
        experience: 'primera-vez',
        name: 'No guardar',
        recentSituation: 'texto sensible de diario',
      });
      result.current.setStep('checkin');
    });

    const stored = loadGuestProgress();
    expect(stored).not.toBeNull();
    expect(stored!.step).toBe('checkin');
    expect(stored!.duration).toBe(3);
    expect(stored!.intention).toBe('calmar-ritmo');
    const raw = localStorage.getItem(GUEST_PROGRESS_KEY)!;
    expect(raw).not.toMatch(/No guardar|texto sensible|diario/i);

    unmount();

    const { result: result2 } = renderHook(() => useSession());
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(result2.current.session.step).toBe('checkin');
    expect(result2.current.session.checkIn.duration).toBe(3);
    expect(result2.current.session.checkIn.name).toBe('');
    expect(result2.current.session.checkIn.recentSituation).toBe('');
  });

  it('cuenta meditación al llegar a feedback y borra todo en deleteSession', async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    act(() => {
      result.current.updateCheckIn({
        duration: 1,
        intention: 'calmar-ritmo',
        style: 'respiracion-natural',
        moment: 'ahora',
        experience: 'primera-vez',
      });
      result.current.setStep('feedback');
    });

    expect(loadGuestProgress()?.meditationCompleted).toBe(true);
    expect(loadGuestProgress()?.meditationCount).toBe(1);

    act(() => {
      result.current.deleteSession();
    });

    expect(loadGuestProgress()).toBeNull();
    expect(result.current.session.step).toBe('deleted');
  });
});
