import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppHandler } from '../accountServer.mjs';
import { createAccountStore } from '../store/createStore.mjs';
import {
  hashVisitorId,
  isValidProductEvent,
  isValidVisitorId,
  isVisitPath,
  isVisitorsCountPath,
} from '../visitors.mjs';

const ORIGIN = 'http://localhost:5173';
const VISITOR_A = '11111111-1111-4111-8111-111111111111';
const VISITOR_B = '22222222-2222-4222-8222-222222222222';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'meditacion-visitors-'));
}

async function withTestServer(callback) {
  const dir = makeTempDir();
  const store = await createAccountStore({
    fallbackPath: join(dir, 'app-store.json'),
    forceEngine: 'json',
  });
  const handler = createAppHandler({
    store,
    sessionPepper: 'test-pepper-for-visitors-hash',
    ai: { apiKey: '' },
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    await callback({ port, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visitors helpers', () => {
  it('reconoce rutas, UUID anónimo y eventos de producto', () => {
    expect(isVisitPath('/api/visit')).toBe(true);
    expect(isVisitPath('/api/visit?x=1')).toBe(true);
    expect(isVisitPath('/api/visitors/count')).toBe(false);
    expect(isVisitorsCountPath('/api/visitors/count')).toBe(true);
    expect(isValidVisitorId(VISITOR_A)).toBe(true);
    expect(isValidVisitorId('not-a-uuid')).toBe(false);
    expect(isValidVisitorId('')).toBe(false);
    expect(isValidProductEvent('pageview')).toBe(true);
    expect(isValidProductEvent('session_complete')).toBe(true);
    expect(isValidProductEvent('bounce')).toBe(false);
  });

  it('hashea el id con pepper (nunca persiste el valor en claro)', () => {
    const a = hashVisitorId(VISITOR_A, 'pepper');
    const b = hashVisitorId(VISITOR_A, 'pepper');
    const other = hashVisitorId(VISITOR_A, 'other');
    expect(a).toBe(b);
    expect(a).not.toBe(other);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain(VISITOR_A);
  });
});

describe('unique visitor and product event endpoints', () => {
  it('cuenta pageviews, session_complete y visitantes únicos', async () => {
    await withTestServer(async ({ port, store }) => {
      const first = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: VISITOR_A, event: 'pageview' }),
      });
      expect(first.status).toBe(204);
      expect(store.countUniqueVisitors()).toBe(1);
      expect(store.countProductEvents('pageview')).toBe(1);
      expect(store.countProductEvents('session_complete')).toBe(0);

      // Sin event → pageview por compatibilidad con #18
      const again = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: VISITOR_A }),
      });
      expect(again.status).toBe(204);
      expect(store.countUniqueVisitors()).toBe(1);
      expect(store.countProductEvents('pageview')).toBe(2);

      const complete = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: VISITOR_A, event: 'session_complete' }),
      });
      expect(complete.status).toBe(204);
      expect(store.countProductEvents('session_complete')).toBe(1);

      const second = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: VISITOR_B, event: 'pageview' }),
      });
      expect(second.status).toBe(204);
      expect(store.countUniqueVisitors()).toBe(2);

      const countNoOrigin = await fetch(
        `http://127.0.0.1:${port}/api/visitors/count`,
      );
      expect(countNoOrigin.status).toBe(200);
      expect(await countNoOrigin.json()).toEqual({
        uniqueVisitors: 2,
        pageviews: 3,
        sessionCompletes: 1,
      });

      const countOk = await fetch(`http://127.0.0.1:${port}/api/visitors/count`, {
        headers: { Origin: ORIGIN },
      });
      expect(countOk.status).toBe(200);
      expect(await countOk.json()).toEqual({
        uniqueVisitors: 2,
        pageviews: 3,
        sessionCompletes: 1,
      });

      const persisted = store.recordUniqueVisitor(
        hashVisitorId(VISITOR_A, 'test-pepper-for-visitors-hash'),
      );
      expect(persisted.isNew).toBe(false);
    });
  });

  it('exige origen allowlisted en POST y rechaza ids o eventos inválidos', async () => {
    await withTestServer(async ({ port }) => {
      const noOrigin = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: VISITOR_A, event: 'pageview' }),
      });
      expect(noOrigin.status).toBe(403);

      const badOrigin = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: {
          Origin: 'http://evil.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: VISITOR_A, event: 'pageview' }),
      });
      expect(badOrigin.status).toBe(403);

      const badId = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'tracking-pixel.gif', event: 'pageview' }),
      });
      expect(badId.status).toBe(400);
      expect((await badId.json()).error).toBe('VISITOR_ID_INVALID');

      const badEvent = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: VISITOR_A, event: 'questionnaire' }),
      });
      expect(badEvent.status).toBe(400);
      expect((await badEvent.json()).error).toBe('EVENT_INVALID');

      const countBad = await fetch(`http://127.0.0.1:${port}/api/visitors/count`, {
        headers: { Origin: 'http://evil.example' },
      });
      expect(countBad.status).toBe(403);
    });
  });

  it('responde OPTIONS con CORS para el origen publicado', async () => {
    await withTestServer(async ({ port }) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/visit`, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    });
  });
});
