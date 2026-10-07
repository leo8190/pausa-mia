/** Closed vocabulary: never attach answers, scripts, audio or error messages. */
import { getAccountApiBaseUrl } from './accountApiUrl';
import { createFunnelTransport, type FunnelSink } from './funnelTransport';
import { isUsageTrackingExcluded } from './usagePrivacy';
import { validateFunnelMeasurement, type FunnelMeasurement } from './funnelMeasurement';

export const FUNNEL_EVENTS = [
  'entry',
  'questionnaire_started',
  'script_generated',
  'audio_started',
  'audio_finished',
  'closing_reached',
  'feedback_given',
  'script_error',
  'audio_error',
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
export type FunnelObservation = Readonly<{
  event: FunnelEvent;
  dayUtc: string;
  elapsedMs?: number;
}>;

export function createProductFunnel(
  enabled: () => boolean,
  now: () => Date = () => new Date(),
  sink?: FunnelSink,
) {
  let consent = false;
  let epoch = 0;
  let revision = 0;
  let deletionStatus: 'idle' | 'pending' | 'failed' | 'done' = 'idle';
  let deletionVersion = 0;
  const observations = new Map<FunnelEvent, FunnelObservation>();
  const listeners = new Set<() => void>();
  const isConsented = () => enabled() && consent;
  function notify() {
    revision += 1;
    listeners.forEach((listener) => listener());
  }
  function record(
    event: FunnelEvent,
    measurement?: FunnelMeasurement,
    expectedEpoch = epoch,
  ) {
    if (!isConsented() || expectedEpoch !== epoch || !FUNNEL_EVENTS.includes(event))
      return;
    const safeMeasurement =
      measurement === undefined
        ? undefined
        : validateFunnelMeasurement(event, measurement);
    if (measurement !== undefined && !safeMeasurement) return;
    if (!observations.has(event)) {
      observations.set(event, {
        event,
        dayUtc: now().toISOString().slice(0, 10),
        ...(safeMeasurement ?? {}),
      });
      if (safeMeasurement) sink?.record(event, safeMeasurement);
      else sink?.record(event);
      notify();
    }
  }
  async function confirmDeletion(request: Promise<boolean>) {
    const version = ++deletionVersion;
    deletionStatus = 'pending';
    notify();
    try {
      const confirmed = await request;
      if (version === deletionVersion) deletionStatus = confirmed ? 'done' : 'failed';
    } catch {
      if (version === deletionVersion) deletionStatus = 'failed';
    }
    if (version === deletionVersion) notify();
  }
  function setConsent(value: boolean) {
    if (value === consent && enabled() && value) return;
    if (!value && sink) void confirmDeletion(sink.revoke());
    epoch += 1;
    observations.clear();
    consent = enabled() && value;
    if (consent) {
      if (deletionStatus === 'done') deletionStatus = 'idle';
      sink?.begin();
      record('entry');
    }
    notify();
  }
  function retryDeletion() {
    if (sink && deletionStatus === 'failed') void confirmDeletion(sink.retryRevoke());
  }
  /** Fin de una práctica: conservar su recuento consentido y pedir permiso otra vez. */
  function finishRun() {
    if (!consent) return;
    sink?.finish();
    epoch += 1;
    observations.clear();
    consent = false;
    notify();
  }
  /** Capture permission at operation start; late callbacks cannot revive data. */
  function capture() {
    const operationEpoch = epoch;
    const permitted = isConsented();
    return (event: FunnelEvent, measurement?: FunnelMeasurement) => {
      if (permitted) record(event, measurement, operationEpoch);
    };
  }
  return {
    record,
    capture,
    setConsent,
    finishRun,
    retryDeletion,
    deletionStatus: () => deletionStatus,
    isConsented,
    revision: () => revision,
    snapshot: (): FunnelObservation[] =>
      isConsented() ? [...observations.values()].map((entry) => ({ ...entry })) : [],
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Preview is strictly local. Production requires a configured first-party API.
export const isFunnelPreviewEnabled = () =>
  import.meta.env.DEV && import.meta.env.VITE_PRODUCT_FUNNEL_PREVIEW === 'true';
export const isFunnelProductionEnabled = () =>
  import.meta.env.PROD && getAccountApiBaseUrl().length > 0;
export const productFunnel = createProductFunnel(
  () =>
    !isUsageTrackingExcluded() &&
    (isFunnelPreviewEnabled() || isFunnelProductionEnabled()),
  () => new Date(),
  isFunnelProductionEnabled() ? createFunnelTransport() : undefined,
);

/** A run only completes after every segment actually started and ended, in order.
 * Seeking, cancellation and errors invalidate completion. Never infer from UI state.
 * Browser callbacks are evidence of playback, not of a person hearing the sound.
 */
export function createAudioObservation(
  segmentCount: number,
  emit: (event: FunnelEvent) => void = productFunnel.capture(),
) {
  let valid = Number.isInteger(segmentCount) && segmentCount > 0;
  let next = 0;
  let started = false;
  let completed = false;
  return {
    started(index: number) {
      if (!valid || index !== next || completed) return;
      started = true;
      emit('audio_started');
    },
    ended(index: number) {
      if (!valid || index !== next || !started || completed) {
        valid = false;
        return;
      }
      next += 1;
      started = false;
    },
    complete() {
      if (valid && !completed && next === segmentCount) {
        completed = true;
        emit('audio_finished');
      }
    },
    invalidate() {
      valid = false;
    },
    failed() {
      valid = false;
      emit('audio_error');
    },
  };
}
