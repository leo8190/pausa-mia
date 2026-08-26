import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOrCreateVisitorId,
  isValidVisitorId,
  pingUniqueVisitor,
  resetVisitorPingForTests,
  VISITOR_ID_STORAGE_KEY,
} from '../lib/visitorPing';

describe('visitorPing', () => {
  afterEach(() => {
    resetVisitorPingForTests();
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

  it('envía un POST mínimo con el id y sin credentials', async () => {
    vi.stubEnv('VITE_ACCOUNT_API_URL', 'https://pausa-mia-api.fly.dev');
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const id = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    getOrCreateVisitorId(storage, () => id);

    // Reinyectar storage vía getOrCreate dentro de ping: mock localStorage
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      return store.get(key) ?? null;
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      store.set(key, String(value));
    });

    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    pingUniqueVisitor({ VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pausa-mia-api.fly.dev/api/visit');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.body).toBe(JSON.stringify({ id }));

    pingUniqueVisitor({ VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('no lanza si el fetch falla (modo demo)', () => {
    vi.stubEnv('VITE_ACCOUNT_API_URL', 'https://pausa-mia-api.fly.dev');
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(
      'cccccccc-dddd-4eee-8fff-000000000000',
    );
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    expect(() =>
      pingUniqueVisitor({ VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' }, fetchImpl),
    ).not.toThrow();
    getItem.mockRestore();
  });
});
