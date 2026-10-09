import { afterEach, expect, it, vi } from 'vitest';
import { isUsageTrackingExcluded } from '../lib/usagePrivacy';
import { createFunnelTransport } from '../lib/funnelTransport';
import { productFunnel } from '../lib/productFunnel';

afterEach(() => {
  productFunnel.setConsent(false);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([{ doNotTrack: '1' }, { globalPrivacyControl: true }])(
  'respects browser opt-out %j',
  async (preferences) => {
    expect(isUsageTrackingExcluded(preferences)).toBe(true);
    vi.stubGlobal('navigator', preferences);
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PRODUCT_FUNNEL_PREVIEW', 'true');
    productFunnel.setConsent(true);
    productFunnel.record('audio_started');
    expect(productFunnel.isConsented()).toBe(false);
    expect(productFunnel.snapshot()).toEqual([]);
    const fetchImpl = vi.fn();
    const newId = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    const sink = createFunnelTransport(
      { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
      fetchImpl,
      newId,
    );
    sink.begin();
    sink.record('entry');
    await Promise.resolve();
    expect(newId).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);

it('does not infer an opt-in from missing browser privacy flags', () => {
  expect(isUsageTrackingExcluded({})).toBe(false);
  expect(
    isUsageTrackingExcluded({ doNotTrack: '0', globalPrivacyControl: false }),
  ).toBe(false);
  productFunnel.record('entry');
  expect(productFunnel.snapshot()).toEqual([]);
});

it('checks opt-out again before queued transmission while deletion remains possible', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
  const sink = createFunnelTransport(
    { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' },
    fetchImpl,
    () => '11111111-1111-4111-8111-111111111111',
    () => '',
  );
  sink.begin();
  sink.record('entry');
  vi.stubGlobal('navigator', { globalPrivacyControl: true });
  await Promise.resolve();
  await Promise.resolve();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await sink.revoke()).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE');
});
