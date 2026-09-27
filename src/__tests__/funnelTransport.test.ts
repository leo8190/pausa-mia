import { describe, expect, it, vi } from 'vitest';
import { createProductFunnel } from '../lib/productFunnel';
import { createFunnelTransport, getFunnelSource } from '../lib/funnelTransport';

const ENV = { VITE_ACCOUNT_API_URL: 'https://pausa-mia-api.fly.dev' };
const RUN = '11111111-1111-4111-8111-111111111111';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('production funnel transport', () => {
  it('sends nothing before separate consent and uses only closed fields afterwards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const sink = createFunnelTransport(
      ENV,
      fetchMock as unknown as typeof fetch,
      () => RUN,
      () => '?pm_source=okara&journal=PRIVATE-DIARY',
    );
    const funnel = createProductFunnel(
      () => true,
      () => new Date('2026-09-26'),
      sink,
    );
    funnel.record('questionnaire_started');
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();

    funnel.setConsent(true);
    funnel.record('audio_started');
    funnel.record('audio_started');
    funnel.finishRun();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [entry, audio] = fetchMock.mock.calls.map(([url, request]) => ({
      url,
      request,
      body: JSON.parse(request.body),
    }));
    expect(entry.body).toEqual({ runId: RUN, event: 'entry', source: 'okara' });
    expect(audio.body).toEqual({ runId: RUN, event: 'audio_started' });
    for (const item of [entry, audio]) {
      expect(item.url).toBe('https://pausa-mia-api.fly.dev/api/funnel/event');
      expect(item.request.credentials).toBe('omit');
      expect(item.request.referrerPolicy).toBe('no-referrer');
      expect(JSON.stringify(item)).not.toContain('PRIVATE-DIARY');
    }
  });

  it('revokes this run and ignores callbacks captured before revocation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const sink = createFunnelTransport(
      ENV,
      fetchMock as unknown as typeof fetch,
      () => RUN,
      () => '',
    );
    const funnel = createProductFunnel(
      () => true,
      () => new Date(),
      sink,
    );
    funnel.setConsent(true);
    const delayed = funnel.capture();
    await tick();
    funnel.setConsent(false);
    delayed('audio_finished');
    await tick();
    expect(fetchMock.mock.calls.at(-1)?.[1].method).toBe('DELETE');
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body)).toEqual({ runId: RUN });
    expect(
      fetchMock.mock.calls.some(([, req]) => req.body.includes('audio_finished')),
    ).toBe(false);
    expect(funnel.deletionStatus()).toBe('done');
  });

  it('reports an unconfirmed deletion and retries it without another identifier', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const sink = createFunnelTransport(
      ENV,
      fetchMock as unknown as typeof fetch,
      () => RUN,
      () => '',
    );
    const funnel = createProductFunnel(
      () => true,
      () => new Date(),
      sink,
    );
    funnel.setConsent(true);
    await tick();
    funnel.finishRun();
    funnel.setConsent(false);
    await tick();
    expect(funnel.deletionStatus()).toBe('failed');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    funnel.retryDeletion();
    await tick();
    expect(funnel.deletionStatus()).toBe('done');
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ runId: RUN });
  });

  it('marks an explicit production QA run for exclusion from public counts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const sink = createFunnelTransport(
      ENV,
      fetchMock as unknown as typeof fetch,
      () => RUN,
      () => '?pm_qa=1&pm_source=shared',
    );
    createProductFunnel(
      () => true,
      () => new Date(),
      sink,
    ).setConsent(true);
    await tick();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      runId: RUN,
      event: 'entry',
      source: 'shared',
      qa: true,
    });
  });

  it('never forwards unknown attribution values or raw URLs', () => {
    expect(getFunnelSource('?pm_source=instagram')).toBe('instagram');
    expect(getFunnelSource('?pm_source=https://example.com/?email=PRIVATE')).toBe(
      'unattributed',
    );
    expect(getFunnelSource('?utm_source=PRIVATE')).toBe('unattributed');
  });
});
