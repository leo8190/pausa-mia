import { FUNNEL_EVENTS, FUNNEL_SOURCES, FUNNEL_RETENTION_DAYS } from './funnel.mjs';

const DAY_MS = 86_400_000;
const STAGES = [
  'entry',
  'questionnaire_started',
  'script_generated',
  'audio_started',
  'audio_finished',
];
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function funnelDayArt(timestamp) {
  return dayFormatter.format(new Date(timestamp));
}

function emptyCohort(dayArt, source) {
  return {
    dayArt,
    source,
    runs: 0,
    stages: STAGES.map((event) => ({ event, runs: 0 })),
    inProgressRuns: 0,
    partialCoverageRuns: 0,
    expiredWithRecordedError: 0,
    expiredDropOffs: STAGES.slice(0, -1).map((event) => ({ after: event, runs: 0 })),
  };
}

/** Private aggregation only. Never return a run hash, raw row, or account identity. */
export function buildFunnelAnalytics(snapshot, at = new Date().toISOString()) {
  const end = Date.parse(at);
  if (!Number.isFinite(end)) throw new Error('FUNNEL_REPORT_TIME_INVALID');
  const cutoff = end - FUNNEL_RETENTION_DAYS * DAY_MS;
  const selected = new Map();
  const excluded = {
    qaRuns: 0,
    revokedRuns: 0,
    outsideRetentionRuns: 0,
    invalidRuns: 0,
    invalidEvents: 0,
    duplicateEvents: 0,
  };
  for (const run of snapshot.runs) {
    const start = Date.parse(run.createdAt);
    const expiry = Date.parse(run.expiresAt);
    if (
      !run.runHash ||
      !FUNNEL_SOURCES.includes(run.source) ||
      !Number.isFinite(start) ||
      !Number.isFinite(expiry) ||
      expiry <= start ||
      start > end ||
      (run.qa !== false && run.qa !== true) ||
      selected.has(run.runHash)
    ) {
      excluded.invalidRuns += 1;
      continue;
    }
    if (start < cutoff) {
      excluded.outsideRetentionRuns += 1;
      continue;
    }
    if (run.qa) {
      excluded.qaRuns += 1;
      continue;
    }
    if (run.revokedAt) {
      excluded.revokedRuns += 1;
      continue;
    }
    selected.set(run.runHash, { ...run, start, expiry, events: new Map() });
  }
  for (const row of snapshot.events) {
    const run = selected.get(row.runHash);
    if (!run) continue;
    const received = Date.parse(row.createdAt);
    if (
      !FUNNEL_EVENTS.includes(row.event) ||
      !Number.isFinite(received) ||
      received < run.start ||
      received >= run.expiry ||
      received > end
    ) {
      excluded.invalidEvents += 1;
      continue;
    }
    if (run.events.has(row.event)) {
      excluded.duplicateEvents += 1;
      run.events.set(row.event, Math.min(received, run.events.get(row.event)));
    } else run.events.set(row.event, received);
  }
  const cohorts = new Map();
  const daily = new Map();
  const counts = new Map();
  let firstReceived = null;
  let lastReceived = null;
  for (const run of selected.values()) {
    // An entry is required, including in historical/corrupt JSON stores.
    if (!run.events.has('entry')) {
      excluded.invalidRuns += 1;
      continue;
    }
    const dayArt = funnelDayArt(run.createdAt);
    const key = JSON.stringify([dayArt, run.source]);
    const cohort = cohorts.get(key) ?? emptyCohort(dayArt, run.source);
    cohorts.set(key, cohort);
    cohort.runs += 1;
    let prefix = 0;
    let previous = run.start;
    for (const stage of STAGES) {
      const received = run.events.get(stage);
      if (received === undefined || received < previous) break;
      cohort.stages[prefix].runs += 1;
      prefix += 1;
      previous = received;
    }
    if (prefix < STAGES.length) {
      // Consent may begin after the questionnaire: later evidence is partial
      // coverage, not proof that the person abandoned an earlier stage.
      if (
        STAGES.slice(prefix).some((stage) => run.events.has(stage)) ||
        run.events.has('closing_reached') ||
        run.events.has('feedback_given')
      ) {
        cohort.partialCoverageRuns += 1;
      } else if (run.expiry > end) cohort.inProgressRuns += 1;
      else if (run.events.has('script_error') || run.events.has('audio_error')) {
        cohort.expiredWithRecordedError += 1;
      } else if (prefix > 0) cohort.expiredDropOffs[prefix - 1].runs += 1;
    }
    for (const [event, received] of run.events) {
      firstReceived =
        firstReceived === null ? received : Math.min(firstReceived, received);
      lastReceived =
        lastReceived === null ? received : Math.max(lastReceived, received);
      const utcKey = JSON.stringify([
        new Date(received).toISOString().slice(0, 10),
        run.source,
        event,
      ]);
      counts.set(utcKey, (counts.get(utcKey) ?? 0) + 1);
      const artKey = JSON.stringify([funnelDayArt(received), run.source, event]);
      daily.set(artKey, (daily.get(artKey) ?? 0) + 1);
    }
  }
  const rows = (map, dayName) =>
    [...map]
      .map(([key, count]) => {
        const [day, source, event] = JSON.parse(key);
        return { [dayName]: day, source, event, count };
      })
      .sort(
        (a, b) =>
          a[dayName].localeCompare(b[dayName]) ||
          a.source.localeCompare(b.source) ||
          a.event.localeCompare(b.event),
      );
  const cohortRows = [...cohorts.values()].sort(
    (a, b) => a.dayArt.localeCompare(b.dayArt) || a.source.localeCompare(b.source),
  );
  for (const cohort of cohortRows) {
    cohort.stages = cohort.stages.map((stage, index, stages) => ({
      ...stage,
      fromPreviousRate:
        index === 0 || stages[index - 1].runs === 0
          ? null
          : stage.runs / stages[index - 1].runs,
      fromEntryRate: cohort.runs === 0 ? null : stage.runs / cohort.runs,
    }));
  }
  return {
    schemaVersion: 2,
    generatedAt: new Date(end).toISOString(),
    dataStatus: cohortRows.length ? 'available' : 'available_no_consented_events',
    population: 'consented_anonymous_runs_not_verified_people',
    retentionDays: FUNNEL_RETENTION_DAYS,
    window: {
      fromInclusive: new Date(cutoff).toISOString(),
      throughInclusive: new Date(end).toISOString(),
      timezone: 'America/Argentina/Buenos_Aires',
      selection: 'run_created_within_retention',
    },
    observedReceipts: {
      first: firstReceived === null ? null : new Date(firstReceived).toISOString(),
      last: lastReceived === null ? null : new Date(lastReceived).toISOString(),
    },
    coverage: {
      consentedOnly: true,
      allTrafficCovered: false,
      serviceUptimeCoverage: 'not_measured',
      timestampMeaning: 'server_receipt_not_client_latency',
      cohortMeaning: 'ART_day_of_run_entry_and_allowlisted_source',
      partialCoverageMeaning:
        'later_stages_without_ordered_earlier_evidence_excluded_from_dropoff',
      dropOffMeaning:
        'expired_incomplete_run_without_recorded_error_not_proof_of_intent',
      completionMeaning: 'ordered_browser_playback_callbacks_not_verified_listening',
      sourceMeaning: 'allowlisted_pm_source_not_ad_platform_attribution',
      notInstrumented: [
        'new_or_returning_visitors',
        'questionnaire_completed',
        'script_generation_latency',
        'audio_prepared',
        'audio_preparation_latency',
        'audio_pauses',
        'actual_playback_seconds',
        'session_ended',
        'rating_value',
        'return_visit',
        'campaign',
      ],
    },
    exclusions: excluded,
    counts: rows(counts, 'dayUtc'), // Existing report consumers retain their UTC counts.
    dailyEventsArt: rows(daily, 'dayArt'),
    cohorts: cohortRows,
  };
}
