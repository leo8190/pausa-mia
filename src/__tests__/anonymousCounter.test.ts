import { describe, expect, it, vi } from 'vitest';
import {
  buildCounterKey,
  createAnonymousCounter,
  getCounterSource,
  normalizeCounterBaseUrl,
  normalizeCounterNamespace,
} from '../lib/anonymousCounter';
import { createAudioObservation, createProductFunnel } from '../lib/productFunnel';

const ENV = {
  PROD: true,
  VITE_ANON_COUNTER_URL: 'https://abacus.example.org',
  VITE_ANON_COUNTER_NAMESPACE: 'pausa-mia-app',
};

function setup(
  options: {
    env?: Record<string, unknown>;
    search?: string;
    excluded?: boolean;
  } = {},
) {
  const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}')));
  const counter = createAnonymousCounter({
    env: options.env ?? ENV,
    fetchImpl,
    search: () => options.search ?? '',
    excluded: () => options.excluded ?? false,
  });
  const urls = () => fetchImpl.mock.calls.map((call) => String(call[0]));
  return { counter, fetchImpl, urls };
}

describe('anonymous total counter', () => {
  it('counts each milestone once per created meditation, by closed source', () => {
    const { counter, urls } = setup({ search: '?pm_source=meta' });
    counter.count('questionnaire_started');
    counter.count('questionnaire_started');
    counter.count('script_generated');
    counter.count('audio_started');
    counter.count('audio_started');
    counter.count('audio_finished');
    counter.count('script_generated');
    counter.count('audio_started');
    expect(urls()).toEqual([
      'https://abacus.example.org/hit/pausa-mia-app/v1-inicio-meta',
      'https://abacus.example.org/hit/pausa-mia-app/v1-creada-meta',
      'https://abacus.example.org/hit/pausa-mia-app/v1-escuchada-meta',
      'https://abacus.example.org/hit/pausa-mia-app/v1-completa-meta',
      'https://abacus.example.org/hit/pausa-mia-app/v1-creada-meta',
      'https://abacus.example.org/hit/pausa-mia-app/v1-escuchada-meta',
    ]);
  });

  it('never sends cookies, referrer or content, only the total name', () => {
    const { counter, fetchImpl } = setup();
    counter.count('script_generated');
    const [url, init = {}] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://abacus.example.org/hit/pausa-mia-app/v1-creada-directo');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('ignores events outside the milestones and unknown sources', () => {
    const { counter, urls } = setup({ search: '?pm_source=evil%2Fpath' });
    counter.count('entry');
    counter.count('feedback_given');
    counter.count('script_error');
    counter.count('audio_started');
    counter.count('script_generated');
    expect(urls()).toEqual([
      'https://abacus.example.org/hit/pausa-mia-app/v1-creada-directo',
    ]);
    expect(getCounterSource('?pm_source=tiktok')).toBe('tiktok');
    expect(getCounterSource('?pm_source=TikTok')).toBe('directo');
    expect(buildCounterKey('completa', 'youtube')).toBe('v1-completa-youtube');
  });

  it('respects DNT/GPC, QA links and the per-tab opt-out', () => {
    const dnt = setup({ excluded: true });
    dnt.counter.count('script_generated');
    expect(dnt.fetchImpl).not.toHaveBeenCalled();

    const qa = setup({ search: '?pm_qa=1&pm_source=meta' });
    qa.counter.count('script_generated');
    expect(qa.fetchImpl).not.toHaveBeenCalled();

    const optOut = setup();
    const listener = vi.fn();
    optOut.counter.subscribe(listener);
    optOut.counter.setOptOut(true);
    optOut.counter.count('script_generated');
    expect(optOut.fetchImpl).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    optOut.counter.setOptOut(false);
    optOut.counter.count('script_generated');
    expect(optOut.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stays off unless configured with a safe https origin and namespace in production', () => {
    for (const env of [
      { ...ENV, PROD: false },
      { ...ENV, VITE_ANON_COUNTER_URL: 'http://abacus.example.org' },
      { ...ENV, VITE_ANON_COUNTER_URL: 'https://user:pw@abacus.example.org' },
      { ...ENV, VITE_ANON_COUNTER_NAMESPACE: 'x' },
      { ...ENV, VITE_ANON_COUNTER_NAMESPACE: '../admin' },
      { ...ENV, VITE_DISABLE_ANALYTICS: 'true' },
      { PROD: true },
    ]) {
      const { counter, fetchImpl } = setup({ env });
      counter.count('script_generated');
      expect(counter.isEnabled()).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
    expect(normalizeCounterBaseUrl('https://abacus.example.org/some/path')).toBe(
      'https://abacus.example.org',
    );
    expect(normalizeCounterNamespace('pausa-mia-app')).toBe('pausa-mia-app');
  });

  it('never breaks the meditation when the counter service fails', () => {
    const throwing = createAnonymousCounter({
      env: ENV,
      fetchImpl: (() => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      search: () => '',
      excluded: () => false,
    });
    expect(() => throwing.count('script_generated')).not.toThrow();
    const rejecting = createAnonymousCounter({
      env: ENV,
      fetchImpl: (() =>
        Promise.reject(new Error('offline'))) as unknown as typeof fetch,
      search: () => '',
      excluded: () => false,
    });
    expect(() => rejecting.count('script_generated')).not.toThrow();
  });

  it('counts without the optional funnel permission and without double counting', () => {
    const count = vi.fn();
    const funnel = createProductFunnel(() => true, undefined, undefined, { count });
    funnel.record('questionnaire_started');
    const observe = funnel.capture();
    observe('script_generated');
    const audio = createAudioObservation(2, funnel.capture());
    audio.started(0);
    audio.ended(0);
    audio.started(1);
    audio.ended(1);
    audio.complete();
    expect(count.mock.calls.map((call) => call[0])).toEqual([
      'questionnaire_started',
      'script_generated',
      'audio_started',
      'audio_started',
      'audio_finished',
    ]);
    expect(funnel.snapshot()).toEqual([]);

    funnel.setConsent(true);
    count.mockClear();
    funnel.capture()('script_generated');
    expect(count).toHaveBeenCalledTimes(1);
    expect(funnel.snapshot().map((entry) => entry.event)).toContain('script_generated');
  });
});
