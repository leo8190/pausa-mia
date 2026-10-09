import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createProductFunnel, productFunnel } from '../lib/productFunnel';
import { createFunnelTransport } from '../lib/funnelTransport';
import {
  measureScriptGeneration,
  validateFunnelMeasurement,
} from '../lib/funnelMeasurement';
import * as measurement from '../lib/funnelMeasurement';
import * as providers from '../lib/scriptProvider';
import { useSession } from '../hooks/useSession';

afterEach(() => {
  act(() => productFunnel.setConsent(false));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([-1, 300001, 1.5, NaN, Infinity, '42', undefined])(
  'rejects invalid elapsedMs %s',
  (value) => {
    expect(
      validateFunnelMeasurement('script_generated', { elapsedMs: value }),
    ).toBeNull();
  },
);
it('accepts only a closed numeric shape for the two script outcomes', () => {
  expect(validateFunnelMeasurement('script_generated', { elapsedMs: 0 })).toEqual({
    elapsedMs: 0,
  });
  expect(validateFunnelMeasurement('script_error', { elapsedMs: 300000 })).toEqual({
    elapsedMs: 300000,
  });
  expect(validateFunnelMeasurement('audio_started', { elapsedMs: 5 })).toBeNull();
  expect(validateFunnelMeasurement('entry', { elapsedMs: 5 })).toBeNull();
  expect(
    validateFunnelMeasurement('script_generated', { elapsedMs: 5, script: 'PRIVATE' }),
  ).toBeNull();
});
it('uses monotonic elapsed time and omits unsupported or invalid durations rather than clipping', () => {
  expect(measureScriptGeneration(10, 1234.4)).toEqual({ elapsedMs: 1224 });
  expect(measureScriptGeneration(10, 9)).toBeUndefined();
  expect(measureScriptGeneration(10, 300011)).toBeUndefined();
});
it('requires consent, keeps the first result per type, and invalidates late measured callbacks', () => {
  const sink = {
    begin: vi.fn(),
    record: vi.fn(),
    finish: vi.fn(),
    revoke: vi.fn().mockResolvedValue(true),
    retryRevoke: vi.fn(),
  };
  const funnel = createProductFunnel(
    () => true,
    () => new Date(),
    sink,
  );
  funnel.record('script_generated', { elapsedMs: 10 });
  expect(sink.record).not.toHaveBeenCalled();
  funnel.setConsent(true);
  const old = funnel.capture();
  old('script_generated', { elapsedMs: 10 });
  old('script_generated', { elapsedMs: 20 });
  expect(
    sink.record.mock.calls.filter(([event]) => event === 'script_generated'),
  ).toEqual([['script_generated', { elapsedMs: 10 }]]);
  funnel.setConsent(false);
  funnel.setConsent(true);
  old('script_error', { elapsedMs: 20 });
  expect(funnel.snapshot().map((row) => row.event)).toEqual(['entry']);
});
it('transport validates numeric fields itself and never sends unexpected private fields', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  const sink = createFunnelTransport(
    {
      VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev',
      VITE_PRODUCT_FUNNEL_TIMING_ENABLED: 'true',
    },
    fetchMock,
    () => '11111111-1111-4111-8111-111111111111',
    () => '',
  );
  sink.begin();
  sink.record('entry');
  sink.record('script_generated', { elapsedMs: 40 });
  sink.record('script_error', { elapsedMs: 99, script: 'PRIVATE-SCRIPT' } as never);
  sink.record('audio_finished', { elapsedMs: 99 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    runId: '11111111-1111-4111-8111-111111111111',
    event: 'script_generated',
    elapsedMs: 40,
  });
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('PRIVATE');
});

it('keeps the old wire contract until the timing backend is explicitly enabled', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  const sink = createFunnelTransport(
    { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev', PROD: true },
    fetchMock,
    () => '11111111-1111-4111-8111-111111111111',
    () => '',
  );
  sink.begin();
  sink.record('entry');
  sink.record('script_generated', { elapsedMs: 123 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    runId: '11111111-1111-4111-8111-111111111111',
    event: 'script_generated',
  });
});

it.each(['tryGenerate', 'startNow'] as const)(
  'measures successful %s generation and validation without recording the script',
  async (method) => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PRODUCT_FUNNEL_PREVIEW', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aiEnabled: false }) }),
    );
    const measure = vi
      .spyOn(measurement, 'measureScriptGeneration')
      .mockReturnValue({ elapsedMs: 123 });
    const { result } = renderHook(() => useSession());
    act(() => productFunnel.setConsent(true));
    act(() => result.current.updateConsent({ sessionProcessing: true }));
    act(() =>
      result.current.updateCheckIn({
        moment: 'ahora',
        perceivedState: 'tranquilo',
        intention: 'calmar-ritmo',
        experience: 'primera-vez',
        style: 'respiracion-natural',
      }),
    );
    act(() => {
      result.current[method]();
    });
    await waitFor(() => expect(result.current.session.script).not.toBeNull());
    expect(measure).toHaveBeenCalledWith(expect.any(Number));
    expect(
      productFunnel.snapshot().find((row) => row.event === 'script_generated')
        ?.elapsedMs,
    ).toBe(123);
    expect(JSON.stringify(productFunnel.snapshot())).not.toMatch(
      /scriptText|fullText|PRIVATE/,
    );
  },
);
it('measures a generic generation failure without retaining the error or personal prompt', async () => {
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_PRODUCT_FUNNEL_PREVIEW', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aiEnabled: false }) }),
  );
  const provider = providers.createLocalProvider();
  vi.spyOn(providers, 'createLocalProvider').mockReturnValue({
    ...provider,
    generate: vi.fn().mockRejectedValue(new Error('PRIVATE-PROMPT')),
  });
  vi.spyOn(measurement, 'measureScriptGeneration').mockReturnValue({ elapsedMs: 456 });
  const { result } = renderHook(() => useSession());
  act(() => productFunnel.setConsent(true));
  act(() => result.current.updateConsent({ sessionProcessing: true }));
  act(() => result.current.tryGenerate());
  await waitFor(() =>
    expect(productFunnel.snapshot().some((row) => row.event === 'script_error')).toBe(
      true,
    ),
  );
  expect(
    productFunnel.snapshot().find((row) => row.event === 'script_error')?.elapsedMs,
  ).toBe(456);
  expect(JSON.stringify(productFunnel.snapshot())).not.toContain('PRIVATE');
});
