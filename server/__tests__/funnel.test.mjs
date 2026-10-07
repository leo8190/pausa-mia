import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppHandler } from '../accountServer.mjs';
import { createAccountStore } from '../store/createStore.mjs';
import { hashFunnelRunId, validateFunnelEvent } from '../funnel.mjs';
import { readFunnelReportSnapshot } from '../funnelReportSnapshot.mjs';

const ORIGIN = 'https://leo8190.github.io';
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const PEPPER = 'test-pepper-funnel-report-with-length-123';
const require = createRequire(import.meta.url);

async function withStore(engine, callback) {
  const dir = mkdtempSync(join(tmpdir(), 'pausa-funnel-'));
  const storePath = join(dir, engine === 'json' ? 'data.json' : 'data.db');
  const open = () =>
    createAccountStore({
      forceEngine: engine,
      sqlitePath: engine === 'sqlite' ? storePath : join(dir, 'unused.db'),
      fallbackPath: engine === 'json' ? storePath : join(dir, 'unused.json'),
    });
  const store = await open();
  const server = createServer(
    createAppHandler({
      store,
      sessionPepper: PEPPER,
      allowedOrigins: new Set([ORIGIN]),
      ai: { apiKey: '' },
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method, body, origin = ORIGIN, headers = {}) =>
    fetch(`${url}${path}`, {
      method,
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    await callback({ store, open, request, url, storePath });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.each(['json', 'sqlite'])('consented funnel in %s store', (engine) => {
  it('accepts optional bounded client timing and preserves the first result across duplicates/reopen', async () => {
    await withStore(engine, async ({ request, storePath, open }) => {
      await request('/api/funnel/event', 'POST', {
        runId: ID,
        event: 'entry',
        source: 'shared',
      });
      for (const [event, elapsedMs] of [
        ['script_generated', 0],
        ['script_error', 300_000],
      ]) {
        expect(
          (await request('/api/funnel/event', 'POST', { runId: ID, event, elapsedMs }))
            .status,
        ).toBe(204);
        expect(
          (
            await request('/api/funnel/event', 'POST', {
              runId: ID,
              event,
              elapsedMs: 999,
            })
          ).status,
        ).toBe(204);
      }
      const reopened = await open();
      try {
        const env = {
          ACCOUNT_STORE_ENGINE: engine,
          ACCOUNT_DB_PATH: storePath,
          ACCOUNT_STORE_JSON_PATH: storePath,
        };
        const rows = readFunnelReportSnapshot(env).events;
        expect(rows.find((row) => row.event === 'script_generated').elapsedMs).toBe(0);
        expect(rows.find((row) => row.event === 'script_error').elapsedMs).toBe(
          300_000,
        );
        expect(rows.filter((row) => row.event === 'script_generated')).toHaveLength(1);
        expect(rows.find((row) => row.event === 'entry').elapsedMs).toBeNull();
      } finally {
        reopened.close();
      }
    });
  });
  it('rejects timing on other events, invalid values and extra fields without persistence', async () => {
    await withStore(engine, async ({ request, store, storePath }) => {
      await request('/api/funnel/event', 'POST', {
        runId: ID,
        event: 'entry',
        source: 'shared',
      });
      for (const elapsedMs of [null, -1, 300_001, 1.5, '10', {}, [10]]) {
        expect(
          (
            await request('/api/funnel/event', 'POST', {
              runId: ID,
              event: 'script_generated',
              elapsedMs,
            })
          ).status,
        ).toBe(400);
      }
      for (const event of ['audio_started', 'audio_error', 'feedback_given']) {
        expect(
          (
            await request('/api/funnel/event', 'POST', {
              runId: ID,
              event,
              elapsedMs: 10,
            })
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            runId: ID,
            event: 'entry',
            source: 'shared',
            elapsedMs: 10,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            runId: ID,
            event: 'script_error',
            elapsedMs: 10,
            error: 'PRIVATE',
          })
        ).status,
      ).toBe(400);
      expect(store.getFunnelReport().map((row) => row.event)).toEqual(['entry']);
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            runId: ID,
            event: 'script_error',
          })
        ).status,
      ).toBe(204);
      const rows = readFunnelReportSnapshot({
        ACCOUNT_STORE_ENGINE: engine,
        ACCOUNT_DB_PATH: storePath,
        ACCOUNT_STORE_JSON_PATH: storePath,
      }).events;
      expect(rows.find((row) => row.event === 'script_error').elapsedMs).toBeNull();
    });
  });
  it.each([{ DNT: '1' }, { 'Sec-GPC': '1' }])(
    'does not collect with opt-out %j but permits revocation',
    async (headers) => {
      await withStore(engine, async ({ store, request }) => {
        const entry = { runId: ID, event: 'entry', source: 'shared' };
        expect(
          (await request('/api/funnel/event', 'POST', entry, ORIGIN, headers)).status,
        ).toBe(204);
        expect(store.getFunnelReport()).toEqual([]);
        await request('/api/funnel/event', 'POST', entry);
        expect(store.getFunnelReport()).toHaveLength(1);
        expect(
          (
            await request(
              '/api/funnel/revoke',
              'DELETE',
              { runId: ID },
              ORIGIN,
              headers,
            )
          ).status,
        ).toBe(204);
        expect(store.getFunnelReport()).toEqual([]);
      });
    },
  );
  it('requires permission-shaped entry, deduplicates and keeps legacy counters separate', async () => {
    await withStore(engine, async ({ store, request, url }) => {
      const before = await request('/api/funnel/event', 'POST', {
        runId: ID,
        event: 'audio_started',
      });
      expect(before.status).toBe(410);
      expect(store.getFunnelReport()).toEqual([]);

      const entry = { runId: ID, event: 'entry', source: 'instagram' };
      expect((await request('/api/funnel/event', 'POST', entry)).status).toBe(204);
      expect((await request('/api/funnel/event', 'POST', entry)).status).toBe(204);
      const audio = { runId: ID, event: 'audio_started' };
      expect((await request('/api/funnel/event', 'POST', audio)).status).toBe(204);
      expect((await request('/api/funnel/event', 'POST', audio)).status).toBe(204);

      const counts = store.getFunnelReport();
      expect(counts.map(({ event, count }) => [event, count])).toEqual([
        ['audio_started', 1],
        ['entry', 1],
      ]);
      expect(counts.every(({ source }) => source === 'instagram')).toBe(true);
      expect(store.countUniqueVisitors()).toBe(0);
      expect(store.countProductEvents('session_complete')).toBe(0);
      expect((await fetch(`${url}/api/funnel/report`)).status).toBe(404);

      const hash = hashFunnelRunId(ID, PEPPER);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(counts)).not.toContain(ID);
    });
  });

  it('rejects private fields, unknown sources and disallowed origins', async () => {
    await withStore(engine, async ({ store, request }) => {
      const valid = { runId: ID, event: 'entry', source: 'unattributed' };
      expect(
        (await request('/api/funnel/event', 'POST', valid, 'https://bad.example'))
          .status,
      ).toBe(403);
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            ...valid,
            journal: 'PRIVATE-DIARY',
          })
        ).status,
      ).toBe(400);
      expect(
        (await request('/api/funnel/event', 'POST', { ...valid, source: 'secret-url' }))
          .status,
      ).toBe(400);
      expect(
        (await request('/api/funnel/event', 'POST', { ...valid, event: 'mood' }))
          .status,
      ).toBe(400);
      expect(store.getFunnelReport()).toEqual([]);
      expect((await request('/api/funnel/event', 'POST', valid)).status).toBe(204);
      expect(
        (await request('/api/funnel/revoke', 'DELETE', { runId: ID, email: 'a@b.c' }))
          .status,
      ).toBe(400);
    });
  });

  it('excludes QA, deletes on revocation, blocks late events and persists across reopen', async () => {
    await withStore(engine, async ({ store, open, request }) => {
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            runId: OTHER_ID,
            event: 'entry',
            source: 'okara',
            qa: true,
          })
        ).status,
      ).toBe(204);
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            runId: ID,
            event: 'entry',
            source: 'tiktok',
          })
        ).status,
      ).toBe(204);
      expect(store.getFunnelReport().map(({ source }) => source)).toEqual(['tiktok']);
      expect(
        (await request('/api/funnel/revoke', 'DELETE', { runId: ID })).status,
      ).toBe(204);
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            runId: ID,
            event: 'audio_finished',
          })
        ).status,
      ).toBe(410);
      expect(
        (
          await request('/api/funnel/event', 'POST', {
            runId: ID,
            event: 'entry',
            source: 'tiktok',
          })
        ).status,
      ).toBe(410);
      expect(store.getFunnelReport()).toEqual([]);

      const reopened = await open();
      try {
        expect(reopened.getFunnelReport()).toEqual([]);
        expect(
          reopened.recordFunnelEvent({
            runHash: hashFunnelRunId(ID, PEPPER),
            event: 'audio_finished',
            source: null,
          }),
        ).toBe('gone');
      } finally {
        reopened.close();
      }
    });
  });

  it('expires a run after one day and purges retained records after 30 days', async () => {
    await withStore(engine, async ({ store }) => {
      const start = '2026-09-01T00:00:00.000Z';
      const hash = hashFunnelRunId(ID, PEPPER);
      expect(
        store.recordFunnelEvent({
          runHash: hash,
          event: 'entry',
          source: 'shared',
          at: start,
        }),
      ).toBe('stored');
      expect(
        store.recordFunnelEvent({
          runHash: hash,
          event: 'audio_started',
          at: '2026-09-02T00:00:00.000Z',
        }),
      ).toBe('gone');
      expect(store.getFunnelReport('2026-09-15T00:00:00.000Z')).toHaveLength(1);
      expect(store.getFunnelReport('2026-10-02T00:00:00.000Z')).toEqual([]);
    });
  });
});

it('does not accept nonfinite timing or a present undefined timing field', () => {
  for (const elapsedMs of [NaN, Infinity, undefined]) {
    expect(
      validateFunnelEvent({ runId: ID, event: 'script_error', elapsedMs }),
    ).toBeNull();
  }
});

it('adds nullable timing to a prior SQLite funnel once, preserving historical events', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pausa-funnel-timing-upgrade-'));
  const path = join(dir, 'old.db');
  try {
    const { DatabaseSync } = require('node:sqlite');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE funnel_runs (run_hash TEXT PRIMARY KEY, source TEXT NOT NULL, qa INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE funnel_events (run_hash TEXT NOT NULL, event_name TEXT NOT NULL, day_utc TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (run_hash,event_name));
    `);
    const at = new Date().toISOString();
    const expiresAt = new Date(Date.parse(at) + 86_400_000).toISOString();
    old
      .prepare('INSERT INTO funnel_runs VALUES (?, ?, 0, ?, ?, NULL)')
      .run('legacy', 'shared', at, expiresAt);
    for (const event of ['entry', 'script_generated']) {
      old
        .prepare('INSERT INTO funnel_events VALUES (?, ?, ?, ?)')
        .run('legacy', event, at.slice(0, 10), at);
    }
    old.close();
    for (let i = 0; i < 2; i += 1) {
      const store = await createAccountStore({
        forceEngine: 'sqlite',
        sqlitePath: path,
      });
      store.close();
    }
    const rows = readFunnelReportSnapshot({ ACCOUNT_DB_PATH: path }).events;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.elapsedMs === null)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds funnel tables to an older SQLite database without changing old visitor rows', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pausa-funnel-upgrade-'));
  const path = join(dir, 'old.db');
  try {
    const { DatabaseSync } = require('node:sqlite');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE unique_visitors (
      visitor_hash TEXT PRIMARY KEY, first_seen_at TEXT NOT NULL
    );`);
    old
      .prepare('INSERT INTO unique_visitors VALUES (?, ?)')
      .run('prior-visitor-hash', '2026-09-20T00:00:00.000Z');
    old.close();

    const store = await createAccountStore({
      forceEngine: 'sqlite',
      sqlitePath: path,
      fallbackPath: join(dir, 'unused.json'),
    });
    try {
      expect(store.countUniqueVisitors()).toBe(1);
      expect(
        store.recordFunnelEvent({
          runHash: hashFunnelRunId(ID, PEPPER),
          event: 'entry',
          source: 'unattributed',
        }),
      ).toBe('stored');
      expect(store.countUniqueVisitors()).toBe(1);
      expect(store.getFunnelReport().map(({ event, count }) => [event, count])).toEqual(
        [['entry', 1]],
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
