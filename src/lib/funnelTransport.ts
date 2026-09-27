import { buildAccountApiUrl } from './accountApiUrl';
import type { FunnelEvent } from './productFunnel';

export type FunnelSink = {
  begin(): void;
  record(event: FunnelEvent): void;
  finish(): void;
  revoke(): Promise<boolean>;
  retryRevoke(): Promise<boolean>;
};

const SOURCES = new Set(['instagram', 'tiktok', 'okara', 'newsletter', 'shared']);

export function getFunnelSource(search: string): string {
  const value = new URLSearchParams(search).get('pm_source');
  return value && SOURCES.has(value) ? value : 'unattributed';
}

/** The run token exists only in this page's memory. No cookies or visitor ID. */
export function createFunnelTransport(
  env: Record<string, unknown> = import.meta.env,
  fetchImpl: typeof fetch = fetch,
  newRunId: () => string = () => crypto.randomUUID(),
  search: () => string = () => window.location.search,
): FunnelSink {
  let current: {
    id: string;
    controller: AbortController;
    queue: Promise<void>;
  } | null = null;
  const completed = new Set<string>();
  const pendingDeletion = new Set<string>();
  let deletionQueue: Promise<boolean> = Promise.resolve(true);

  function sendDeletions(): Promise<boolean> {
    deletionQueue = deletionQueue.then(async () => {
      for (const runId of pendingDeletion) {
        try {
          const response = await fetchImpl(
            buildAccountApiUrl('/api/funnel/revoke', env),
            {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ runId }),
              credentials: 'omit',
              referrerPolicy: 'no-referrer',
              keepalive: true,
            },
          );
          if (response.ok) {
            pendingDeletion.delete(runId);
            completed.delete(runId);
          }
        } catch {
          // The UI must show an unconfirmed deletion and offer a retry.
        }
      }
      return pendingDeletion.size === 0;
    });
    return deletionQueue;
  }
  return {
    begin() {
      current = {
        id: newRunId(),
        controller: new AbortController(),
        queue: Promise.resolve(),
      };
    },
    record(event) {
      const run = current;
      if (!run) return;
      const signal = run.controller.signal;
      const body =
        event === 'entry'
          ? {
              runId: run.id,
              event,
              source: getFunnelSource(search()),
              ...(new URLSearchParams(search()).get('pm_qa') === '1'
                ? { qa: true }
                : {}),
            }
          : { runId: run.id, event };
      // Entry must arrive before the other events. Every request has a closed body.
      run.queue = run.queue
        .then(async () => {
          if (signal.aborted) return;
          await fetchImpl(buildAccountApiUrl('/api/funnel/event', env), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            keepalive: true,
            signal,
          });
        })
        .catch(() => undefined);
    },
    finish() {
      // Already queued events complete; this run is never reused.
      if (current) completed.add(current.id);
      current = null;
    },
    revoke() {
      const run = current;
      current = null;
      if (run) {
        run.controller.abort();
        pendingDeletion.add(run.id);
      }
      for (const runId of completed) pendingDeletion.add(runId);
      return sendDeletions();
    },
    retryRevoke: sendDeletions,
  };
}
