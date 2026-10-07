import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppHandler } from '../accountServer.mjs';
import { createAccountStore } from '../store/createStore.mjs';
import { hashFunnelRunId } from '../funnel.mjs';

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
    await callback({ store, open, request, url });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.each(['json', 'sqlite'])('consented funnel in %s store', (engine) => {
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
