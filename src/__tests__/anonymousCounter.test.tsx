import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCounterKey,
  createAnonymousCounter,
  getCounterSource,
  normalizeCounterBaseUrl,
  normalizeCounterNamespace,
} from '../lib/anonymousCounter';
import { createAudioObservation, createProductFunnel } from '../lib/productFunnel';
import { CounterConsentOption } from '../components/CounterConsentOption';
import { AnonymousCounterNotice } from '../components/AnonymousCounterNotice';

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
    consent?: boolean;
  } = {},
) {
  const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}')));
  const counter = createAnonymousCounter({
    env: options.env ?? ENV,
    fetchImpl,
    search: () => options.search ?? '',
    excluded: () => options.excluded ?? false,
  });
  if (options.consent !== false) counter.setConsent(true);
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

  it('counts nothing without permission, which starts unchecked and can be withdrawn', () => {
    const fresh = setup({ consent: false });
    expect(fresh.counter.isConsented()).toBe(false);
    fresh.counter.count('questionnaire_started');
    fresh.counter.count('script_generated');
    expect(fresh.fetchImpl).not.toHaveBeenCalled();

    const listener = vi.fn();
    fresh.counter.subscribe(listener);
    fresh.counter.setConsent(true);
    fresh.counter.count('script_generated');
    expect(fresh.fetchImpl).toHaveBeenCalledTimes(1);
    fresh.counter.setConsent(false);
    fresh.counter.count('script_generated');
    expect(fresh.fetchImpl).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('respects DNT/GPC and QA links even with permission', () => {
    const dnt = setup({ excluded: true });
    dnt.counter.count('script_generated');
    expect(dnt.fetchImpl).not.toHaveBeenCalled();

    const qa = setup({ search: '?pm_qa=1&pm_source=meta' });
    qa.counter.count('script_generated');
    expect(qa.fetchImpl).not.toHaveBeenCalled();
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
      expect(counter.isConsented()).toBe(false);
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
    throwing.setConsent(true);
    expect(() => throwing.count('script_generated')).not.toThrow();
    const rejecting = createAnonymousCounter({
      env: ENV,
      fetchImpl: (() =>
        Promise.reject(new Error('offline'))) as unknown as typeof fetch,
      search: () => '',
      excluded: () => false,
    });
    rejecting.setConsent(true);
    expect(() => rejecting.count('script_generated')).not.toThrow();
  });

  it('is independent from the funnel permission and never double counts', () => {
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

  it('shows an unchecked, explained option and a way to withdraw it', () => {
    const { counter, fetchImpl } = setup({ consent: false });
    render(
      <>
        <CounterConsentOption counter={counter} />
        <AnonymousCounterNotice counter={counter} />
      </>,
    );
    const box = screen.getByRole('checkbox', { name: /contador anónimo/i });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/servicio externo \(Abacus\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dejar de contar' })).toBeNull();

    fireEvent.click(box);
    expect(counter.isConsented()).toBe(true);
    expect(box).toBeChecked();
    act(() => counter.count('script_generated'));
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dejar de contar' }));
    expect(counter.isConsented()).toBe(false);
    expect(box).not.toBeChecked();
  });

  it('hides the option when the counter is not configured', () => {
    const { counter } = setup({ env: { PROD: false }, consent: false });
    const { container } = render(<CounterConsentOption counter={counter} />);
    expect(container).toBeEmptyDOMElement();
  });
});
