import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVisitorCounts, parseVisitorCounts } from '../lib/visitorCounts';

describe('parseVisitorCounts', () => {
  it('acepta la forma nueva con uniqueVisitors, pageviews y sessionCompletes', () => {
    expect(
      parseVisitorCounts({
        uniqueVisitors: 12,
        pageviews: 40,
        sessionCompletes: 7,
      }),
    ).toEqual({
      uniqueVisitors: 12,
      pageviews: 40,
      sessionCompletes: 7,
    });
  });

  it('acepta la forma antigua sólo con uniqueVisitors', () => {
    expect(parseVisitorCounts({ uniqueVisitors: 5 })).toEqual({
      uniqueVisitors: 5,
      pageviews: null,
      sessionCompletes: null,
    });
  });

  it('rechaza cuerpos sin uniqueVisitors usable', () => {
    expect(parseVisitorCounts(null)).toBeNull();
    expect(parseVisitorCounts({})).toBeNull();
    expect(parseVisitorCounts({ uniqueVisitors: '3' })).toBeNull();
    expect(parseVisitorCounts({ pageviews: 1, sessionCompletes: 1 })).toBeNull();
    expect(parseVisitorCounts({ uniqueVisitors: Number.NaN })).toBeNull();
  });

  it('ignora pageviews o sessionCompletes no numéricos en la forma mixta', () => {
    expect(
      parseVisitorCounts({
        uniqueVisitors: 2,
        pageviews: 'x',
        sessionCompletes: 1,
      }),
    ).toEqual({
      uniqueVisitors: 2,
      pageviews: null,
      sessionCompletes: 1,
    });
  });
});

describe('fetchVisitorCounts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('GET /api/visitors/count sin credentials y parsea la forma nueva', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          uniqueVisitors: 9,
          pageviews: 21,
          sessionCompletes: 4,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const counts = await fetchVisitorCounts(
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pausa-mia-api.fly.dev/api/visitors/count');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(counts).toEqual({
      uniqueVisitors: 9,
      pageviews: 21,
      sessionCompletes: 4,
    });
  });

  it('acepta la forma antigua { uniqueVisitors } del API aún no desplegado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ uniqueVisitors: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      fetchVisitorCounts(
        { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
        fetchImpl,
      ),
    ).resolves.toEqual({
      uniqueVisitors: 3,
      pageviews: null,
      sessionCompletes: null,
    });
  });

  it('devuelve null si el API no responde (modo demo)', async () => {
    const offline = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(
      fetchVisitorCounts(
        { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
        offline,
      ),
    ).resolves.toBeNull();

    const badStatus = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(
      fetchVisitorCounts(
        { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
        badStatus,
      ),
    ).resolves.toBeNull();
  });
});
