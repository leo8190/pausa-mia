import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowNextSessionComplete,
  getOrCreateVisitorId,
  isValidVisitorId,
  pingUniqueVisitor,
  reportProductEvent,
  reportSessionComplete,
  resetVisitorPingForTests,
  VISITOR_ID_STORAGE_KEY,
} from '../lib/visitorPing';

describe('visitorPing', () => {
  afterEach(() => {
    resetVisitorPingForTests();
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('valida y reutiliza el id anónimo en localStorage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const first = getOrCreateVisitorId(storage, () => id);
    const second = getOrCreateVisitorId(storage, () => 'should-not-run');
    expect(first).toBe(id);
    expect(second).toBe(id);
    expect(store.get(VISITOR_ID_STORAGE_KEY)).toBe(id);
    expect(isValidVisitorId('nope')).toBe(false);
  });

  it('envía pageview con id + event y sin credentials', () => {
    const id = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);

    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    pingUniqueVisitor(
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pausa-mia-api.fly.dev/api/visit');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.body).toBe(JSON.stringify({ id, event: 'pageview' }));

    pingUniqueVisitor(
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('envía session_complete una vez por ciclo y permite otra tras reset', () => {
    const id = 'dddddddd-eeee-4fff-8000-111111111111';
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    reportSessionComplete(
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
    );
    reportSessionComplete(
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ id, event: 'session_complete' }),
    });

    allowNextSessionComplete();
    reportSessionComplete(
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reportProductEvent sólo manda id y event', () => {
    const id = 'eeeeeeee-ffff-4111-8222-333333333333';
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    reportProductEvent(
      'session_complete',
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
    );

    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(Object.keys(body).sort()).toEqual(['event', 'id']);
    expect(body).toEqual({ id, event: 'session_complete' });
  });

  it('no lanza si el fetch falla (modo demo)', () => {
    localStorage.setItem(
      VISITOR_ID_STORAGE_KEY,
      'cccccccc-dddd-4eee-8fff-000000000000',
    );
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    expect(() =>
      pingUniqueVisitor(
        { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
        fetchImpl,
      ),
    ).not.toThrow();
  });
});
