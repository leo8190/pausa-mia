/**
 * Contador anónimo de totales, sólo con permiso.
 *
 * Con una casilla opcional y desmarcada, suma 1 a un total por hito de la
 * práctica (inicio, creada, escuchada, completa) y por fuente de enlace de una
 * lista cerrada. No usa cookies ni almacenamiento, no crea identificadores y
 * nunca envía respuestas, diario, guion, audio, cuenta, URL ni referrer: la única
 * información es el nombre del total que se incrementa. Respeta DNT/GPC, excluye
 * `?pm_qa=1` y el permiso se retira en cualquier momento (deja de sumar; lo ya
 * sumado no se puede restar porque no está asociado a nadie).
 */
import type { FunnelEvent } from './productFunnel';
import { isUsageTrackingExcluded } from './usagePrivacy';

export const COUNTER_MILESTONES: Partial<Record<FunnelEvent, CounterMilestone>> = {
  questionnaire_started: 'inicio',
  script_generated: 'creada',
  audio_started: 'escuchada',
  audio_finished: 'completa',
};
export type CounterMilestone = 'inicio' | 'creada' | 'escuchada' | 'completa';

const COUNTER_SOURCES = new Set([
  'meta',
  'facebook',
  'instagram',
  'threads',
  'tiktok',
  'youtube',
  'x',
  'whatsapp',
  'okara',
  'newsletter',
  'shared',
]);

const NAMESPACE_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;

/** Sólo fuentes de la lista cerrada; el resto queda como "directo". */
export function getCounterSource(search: string): string {
  const value = new URLSearchParams(search).get('pm_source');
  return value && COUNTER_SOURCES.has(value) ? value : 'directo';
}

/** Origen https sin credenciales ni ruta; cualquier otro valor desactiva el contador. */
export function normalizeCounterBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function normalizeCounterNamespace(value: unknown): string | null {
  return typeof value === 'string' && NAMESPACE_PATTERN.test(value) ? value : null;
}

export function buildCounterKey(milestone: CounterMilestone, source: string): string {
  return `v1-${milestone}-${source}`;
}

type CounterOptions = {
  env?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  search?: () => string;
  excluded?: () => boolean;
};

export function createAnonymousCounter({
  env = import.meta.env,
  fetchImpl = (...args) => fetch(...args),
  search = () => (typeof window === 'undefined' ? '' : window.location.search),
  excluded = () => isUsageTrackingExcluded(),
}: CounterOptions = {}) {
  const baseUrl = normalizeCounterBaseUrl(env.VITE_ANON_COUNTER_URL);
  const namespace = normalizeCounterNamespace(env.VITE_ANON_COUNTER_NAMESPACE);
  const configured =
    baseUrl !== null &&
    namespace !== null &&
    env.VITE_DISABLE_ANALYTICS !== 'true' &&
    (env.PROD === true || env.VITE_ANON_COUNTER_IN_DEV === 'true');

  let consented = false;
  let started = false;
  let practice = 0;
  const countedInPractice = new Map<CounterMilestone, number>();
  let revision = 0;
  const listeners = new Set<() => void>();

  const isQa = () => new URLSearchParams(search()).get('pm_qa') === '1';
  const isActive = () => configured && consented && !excluded() && !isQa();

  function shouldCount(milestone: CounterMilestone): boolean {
    if (milestone === 'inicio') {
      if (started) return false;
      started = true;
      return true;
    }
    if (milestone === 'creada') {
      practice += 1;
      return true;
    }
    // Una vez por meditación creada, aunque el audio tenga varios segmentos o se reinicie.
    if (practice === 0 || countedInPractice.get(milestone) === practice) return false;
    countedInPractice.set(milestone, practice);
    return true;
  }

  function count(event: FunnelEvent) {
    const milestone = COUNTER_MILESTONES[event];
    if (!milestone || !isActive() || !shouldCount(milestone)) return;
    const key = buildCounterKey(milestone, getCounterSource(search()));
    try {
      void Promise.resolve(
        fetchImpl(`${baseUrl}/hit/${namespace}/${key}`, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          keepalive: true,
        }),
      ).catch(() => undefined);
    } catch {
      // Un contador caído nunca interrumpe la meditación.
    }
  }

  function setConsent(value: boolean) {
    const next = configured && value;
    if (consented === next) return;
    consented = next;
    revision += 1;
    listeners.forEach((listener) => listener());
  }

  return {
    count,
    setConsent,
    isConsented: () => consented,
    isEnabled: () => configured,
    revision: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AnonymousCounter = ReturnType<typeof createAnonymousCounter>;

export const anonymousCounter = createAnonymousCounter();
