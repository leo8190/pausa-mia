import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createAccountStore } from '../store/createStore.mjs';
import { buildFunnelAnalytics, funnelDayArt } from '../funnelAnalytics.mjs';
import { readFunnelReportSnapshot } from '../funnelReportSnapshot.mjs';

const AT = '2026-10-06T12:00:00.000Z';
const START = '2026-10-04T02:59:00.000Z';
const stages = [
  'entry',
  'questionnaire_started',
  'script_generated',
  'audio_started',
  'audio_finished',
];
function run(id, overrides = {}) {
  return {
    runHash: id,
    source: 'instagram',
    qa: false,
    revokedAt: null,
    createdAt: START,
    expiresAt: '2026-10-05T02:59:00.000Z',
    ...overrides,
  };
}
function event(id, name, at = START) {
  return { runHash: id, event: name, createdAt: at };
}

describe('private ART funnel aggregation', () => {
  it.each(['closing_reached', 'feedback_given'])(
    'treats late %s consent as partial, not abandonment or playback completion',
    (name) => {
      const report = buildFunnelAnalytics(
        {
          runs: [run('late-feedback')],
          events: [event('late-feedback', 'entry'), event('late-feedback', name)],
        },
        AT,
      );
      expect(report.cohorts[0].partialCoverageRuns).toBe(1);
      expect(report.cohorts[0].expiredDropOffs.every((row) => row.runs === 0)).toBe(
        true,
      );
      expect(report.cohorts[0].stages.at(-1).runs).toBe(0);
      expect(report.counts.some((row) => row.event === 'audio_finished')).toBe(false);
    },
  );
  it('does not call late consent or out-of-order evidence an abandoned entry', () => {
    const report = buildFunnelAnalytics(
      {
        runs: [run('late'), run('out-of-order')],
        events: [
          event('late', 'entry'),
          event('late', 'audio_started'),
          event('late', 'audio_finished'),
          event('out-of-order', 'entry'),
          event('out-of-order', 'questionnaire_started', '2026-10-04T03:01:00Z'),
          event('out-of-order', 'script_generated', '2026-10-04T03:00:00Z'),
        ],
      },
      AT,
    );
    expect(report.cohorts[0].partialCoverageRuns).toBe(2);
    expect(report.cohorts[0].expiredDropOffs.every((row) => row.runs === 0)).toBe(true);
    expect(report.counts.find((row) => row.event === 'audio_finished').count).toBe(1);
    expect(report.cohorts[0].stages.at(-1).runs).toBe(0);
  });
  it('uses ART receipt days, but conversions remain in the entry cohort across midnight', () => {
    expect(funnelDayArt(START)).toBe('2026-10-03');
    const report = buildFunnelAnalytics(
      {
        runs: [run('PRIVATE-HASH')],
        events: stages.map((name, i) =>
          event('PRIVATE-HASH', name, i === 0 ? START : '2026-10-04T03:01:00.000Z'),
        ),
      },
      AT,
    );
    expect(report.cohorts[0].dayArt).toBe('2026-10-03');
    expect(report.cohorts[0].stages.map((row) => row.runs)).toEqual([1, 1, 1, 1, 1]);
    expect(report.cohorts[0].stages.at(-1).fromEntryRate).toBe(1);
    expect(
      report.dailyEventsArt.find((row) => row.event === 'audio_finished').dayArt,
    ).toBe('2026-10-04');
    expect(report.counts.every((row) => row.dayUtc === '2026-10-04')).toBe(true);
    expect(JSON.stringify(report)).not.toContain('PRIVATE-HASH');
  });
  it('does not create conversion by combining events from different runs or invalid order', () => {
    const report = buildFunnelAnalytics(
      {
        runs: [run('a'), run('b'), run('c')],
        events: [
          event('a', 'entry'),
          event('a', 'questionnaire_started'),
          event('b', 'entry'),
          event('b', 'audio_started'),
          event('b', 'audio_finished'),
          event('c', 'entry'),
          event('c', 'questionnaire_started', '2026-10-04T03:01:00Z'),
          event('c', 'script_generated', '2026-10-04T03:00:00Z'),
        ],
      },
      AT,
    );
    expect(report.cohorts[0].stages.map((row) => row.runs)).toEqual([3, 2, 0, 0, 0]);
    expect(report.cohorts[0].stages[2].fromPreviousRate).toBe(0);
    expect(report.cohorts[0].stages[3].fromPreviousRate).toBeNull();
  });
  it('separates active runs, expired with errors, and expired incomplete without errors', () => {
    const report = buildFunnelAnalytics(
      {
        runs: [
          run('active', { expiresAt: '2026-10-07T00:00:00Z' }),
          run('failed'),
          run('drop'),
          run('complete'),
        ],
        events: [
          event('active', 'entry'),
          event('failed', 'entry'),
          event('failed', 'script_error'),
          event('drop', 'entry'),
          event('drop', 'questionnaire_started'),
          ...stages.map((name) => event('complete', name)),
        ],
      },
      AT,
    );
    const cohort = report.cohorts[0];
    expect(cohort.inProgressRuns).toBe(1);
    expect(cohort.expiredWithRecordedError).toBe(1);
    expect(cohort.expiredDropOffs.map((row) => row.runs)).toEqual([0, 1, 0, 0]);
    expect(cohort.stages.at(-1).runs).toBe(1);
  });
  it('excludes QA, revocation, stale runs, future timestamps, unknown vocabulary and duplicates', () => {
    const report = buildFunnelAnalytics(
      {
        runs: [
          run('good'),
          run('qa', { qa: true }),
          run('revoked', { revokedAt: AT }),
          run('old', { createdAt: '2026-08-01T00:00:00Z' }),
          run('source', { source: 'https://secret.example/?token=PRIVATE' }),
        ],
        events: [
          event('good', 'entry'),
          event('good', 'entry'),
          event('good', 'PRIVATE-DIARY'),
          event('good', 'audio_started', '2026-10-07T00:00:00Z'),
          event('qa', 'entry'),
          event('revoked', 'entry'),
          event('old', 'entry'),
          event('source', 'entry'),
        ],
      },
      AT,
    );
    expect(report.cohorts[0].runs).toBe(1);
    expect(report.exclusions).toEqual({
      qaRuns: 1,
      revokedRuns: 1,
      outsideRetentionRuns: 1,
      invalidRuns: 1,
      invalidEvents: 2,
      duplicateEvents: 1,
    });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|secret\.example|runHash|runId/);
  });
  it('distinguishes an available empty dataset and documents missing instrumentation instead of zeros', () => {
    const report = buildFunnelAnalytics({ runs: [], events: [] }, AT);
    expect(report.dataStatus).toBe('available_no_consented_events');
    expect(report.observedReceipts).toEqual({ first: null, last: null });
    expect(report.coverage.notInstrumented).toContain('actual_playback_seconds');
    expect(report.coverage.notInstrumented).toContain('new_or_returning_visitors');
    expect(report.cohorts).toEqual([]);
    expect(report.coverage.allTrafficCovered).toBe(false);
  });
});

describe.each(['sqlite', 'json'])(
  'existing %s persistence, never fabricate a zero report',
  (engine) => {
    it('reads existing records without changing the file, excludes QA and persists through reopen', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'pausa-private-report-'));
      const path = join(dir, engine === 'sqlite' ? 'app.db' : 'app.json');
      const env =
        engine === 'sqlite'
          ? { ACCOUNT_STORE_ENGINE: engine, ACCOUNT_DB_PATH: path }
          : { ACCOUNT_STORE_ENGINE: engine, ACCOUNT_STORE_JSON_PATH: path };
      try {
        const store = await createAccountStore({
          forceEngine: engine,
          sqlitePath: path,
          fallbackPath: path,
        });
        for (const [id, qa] of [
          ['real', false],
          ['qa', true],
        ]) {
          store.recordFunnelEvent({
            runHash: id,
            event: 'entry',
            source: 'shared',
            qa,
            at: START,
          });
        }
        store.close();
        const before = readFileSync(path);
        const report = buildFunnelAnalytics(readFunnelReportSnapshot(env), AT);
        expect(report.cohorts[0].runs).toBe(1);
        expect(report.exclusions.qaRuns).toBe(1);
        expect(readFileSync(path)).toEqual(before);
        expect(buildFunnelAnalytics(readFunnelReportSnapshot(env), AT)).toEqual(report);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    it('rejects a missing or corrupt store without creating persistence', () => {
      const dir = mkdtempSync(join(tmpdir(), 'pausa-report-missing-'));
      const path = join(dir, 'missing-store');
      const env =
        engine === 'sqlite'
          ? { ACCOUNT_STORE_ENGINE: engine, ACCOUNT_DB_PATH: path }
          : { ACCOUNT_STORE_ENGINE: engine, ACCOUNT_STORE_JSON_PATH: path };
      try {
        expect(() => readFunnelReportSnapshot(env)).toThrow(
          'FUNNEL_REPORT_STORE_MISSING',
        );
        expect(existsSync(path)).toBe(false);
        writeFileSync(path, 'PRIVATE-CORRUPT-STORE');
        expect(() => readFunnelReportSnapshot(env)).toThrow(
          'FUNNEL_REPORT_READ_FAILED',
        );
        expect(readFileSync(path, 'utf8')).toBe('PRIVATE-CORRUPT-STORE');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);

it('excludes corrupt SQLite QA flags instead of treating them as real usage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pausa-report-qa-'));
  const path = join(dir, 'app.db');
  try {
    const store = await createAccountStore({ forceEngine: 'sqlite', sqlitePath: path });
    store.recordFunnelEvent({
      runHash: 'invalid-qa',
      event: 'entry',
      source: 'shared',
      at: START,
    });
    store.close();
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(path);
    db.exec('UPDATE funnel_runs SET qa = 2');
    db.close();
    const report = buildFunnelAnalytics(
      readFunnelReportSnapshot({ ACCOUNT_DB_PATH: path }),
      AT,
    );
    expect(report.cohorts).toEqual([]);
    expect(report.exclusions.invalidRuns).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('refuses incomplete SQLite schema without adding tables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pausa-report-schema-'));
  const path = join(dir, 'legacy.db');
  try {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE historical_visitors (count INTEGER);');
    db.close();
    const before = readFileSync(path);
    expect(() => readFunnelReportSnapshot({ ACCOUNT_DB_PATH: path })).toThrow(
      'FUNNEL_REPORT_READ_FAILED',
    );
    expect(readFileSync(path)).toEqual(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('production rejects JSON and CLI reports unavailable/null, not counts0 or raw errors', () => {
  expect(() =>
    readFunnelReportSnapshot({ NODE_ENV: 'production', ACCOUNT_STORE_ENGINE: 'json' }),
  ).toThrow('FUNNEL_REPORT_STORE_UNEXPECTED');
  const dir = mkdtempSync(join(tmpdir(), 'pausa-report-cli-'));
  const path = join(dir, 'PRIVATE-NOT-FOUND.db');
  try {
    let error;
    try {
      execFileSync(process.execPath, ['server/funnelReport.mjs'], {
        env: { NODE_ENV: 'production', ACCOUNT_DB_PATH: path },
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error.status).toBe(1);
    expect(JSON.parse(error.stdout)).toEqual({
      schemaVersion: 2,
      dataStatus: 'unavailable',
      code: 'FUNNEL_REPORT_STORE_MISSING',
      counts: null,
    });
    expect(error.stdout).not.toMatch(/PRIVATE|app\.db|runHash|token/);
    expect(existsSync(path)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
