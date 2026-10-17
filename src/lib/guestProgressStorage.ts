import type {
  AppStep,
  Duration,
  Experience,
  Intention,
  MeditationStyle,
  Moment,
  VoiceVariant,
} from '../types';

/** Clave dedicada de progreso invitado (no mezclar con preferencias). */
export const GUEST_PROGRESS_KEY = 'mam-guest-progress';

/** Pasos que se pueden retomar sin guion ni datos sensibles en memoria. */
const RESTORABLE_STEPS = new Set<AppStep>([
  'welcome',
  'consent',
  'checkin',
  'context',
  'summary',
  'feedback',
]);

const DURATIONS: readonly Duration[] = [1, 3, 5, 10];
const VOICE_VARIANTS: readonly VoiceVariant[] = ['es-AR', 'es-neutro'];

/**
 * Solo campos no sensibles. Nunca diario, situación libre, nombre,
 * estado en texto libre, guion, audio ni contexto.
 */
export interface GuestProgress {
  guest: true;
  duration: Duration;
  voiceVariant: VoiceVariant;
  intention: Intention | '';
  style: MeditationStyle | '';
  moment: Moment | '';
  experience: Experience | '';
  step: AppStep;
  meditationCompleted: boolean;
  meditationCount: number;
  updatedAt: number;
}

export type GuestProgressInput = Omit<GuestProgress, 'guest' | 'updatedAt'> & {
  updatedAt?: number;
};

function isDuration(value: unknown): value is Duration {
  return typeof value === 'number' && (DURATIONS as readonly number[]).includes(value);
}

function isVoiceVariant(value: unknown): value is VoiceVariant {
  return typeof value === 'string' && (VOICE_VARIANTS as readonly string[]).includes(value);
}

/** Normaliza un paso guardado a uno retornable sin guion. */
export function sanitizeGuestStep(step: unknown): AppStep {
  if (typeof step === 'string' && RESTORABLE_STEPS.has(step as AppStep)) {
    return step as AppStep;
  }
  // playback / review / safety / ai-consent / deleted → check-in para retomar
  if (
    step === 'playback' ||
    step === 'review' ||
    step === 'safety' ||
    step === 'ai-consent'
  ) {
    return 'checkin';
  }
  return 'welcome';
}

export function saveGuestProgress(input: GuestProgressInput): void {
  if (typeof localStorage === 'undefined') return;
  const payload: GuestProgress = {
    guest: true,
    duration: isDuration(input.duration) ? input.duration : 5,
    voiceVariant: isVoiceVariant(input.voiceVariant) ? input.voiceVariant : 'es-neutro',
    intention: typeof input.intention === 'string' ? input.intention : '',
    style: typeof input.style === 'string' ? input.style : '',
    moment: typeof input.moment === 'string' ? input.moment : '',
    experience: typeof input.experience === 'string' ? input.experience : '',
    step: sanitizeGuestStep(input.step),
    meditationCompleted: Boolean(input.meditationCompleted),
    meditationCount:
      typeof input.meditationCount === 'number' &&
      Number.isFinite(input.meditationCount) &&
      input.meditationCount >= 0
        ? Math.floor(input.meditationCount)
        : 0,
    updatedAt: input.updatedAt ?? Date.now(),
  };
  try {
    localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode: silently skip.
  }
}

export function loadGuestProgress(): GuestProgress | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GUEST_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestProgress>;
    if (parsed.guest !== true) return null;
    if (!isDuration(parsed.duration) || !isVoiceVariant(parsed.voiceVariant)) {
      return null;
    }
    return {
      guest: true,
      duration: parsed.duration,
      voiceVariant: parsed.voiceVariant,
      intention: typeof parsed.intention === 'string' ? parsed.intention : '',
      style: typeof parsed.style === 'string' ? parsed.style : '',
      moment: typeof parsed.moment === 'string' ? parsed.moment : '',
      experience: typeof parsed.experience === 'string' ? parsed.experience : '',
      step: sanitizeGuestStep(parsed.step),
      meditationCompleted: Boolean(parsed.meditationCompleted),
      meditationCount:
        typeof parsed.meditationCount === 'number' &&
        Number.isFinite(parsed.meditationCount) &&
        parsed.meditationCount >= 0
          ? Math.floor(parsed.meditationCount)
          : 0,
      updatedAt:
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearGuestProgress(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(GUEST_PROGRESS_KEY);
}

export function hasGuestProgress(): boolean {
  return loadGuestProgress() !== null;
}
