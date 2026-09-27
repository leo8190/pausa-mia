import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAudioObservation,
  createProductFunnel,
  FUNNEL_EVENTS,
  productFunnel,
} from '../lib/productFunnel';
import { ProductFunnelPreview } from '../components/ProductFunnelPreview';
import { useSession } from '../hooks/useSession';
import App from '../App';
import * as scriptProvider from '../lib/scriptProvider';

function enablePreview() {
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_PRODUCT_FUNNEL_PREVIEW', 'true');
}
afterEach(() => {
  act(() => productFunnel.setConsent(false));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('bounded, consented, local-only product funnel', () => {
  it('records nothing before consent or when disabled', () => {
    const disabled = createProductFunnel(() => false);
    disabled.setConsent(true);
    disabled.record('audio_finished');
    expect(disabled.snapshot()).toEqual([]);
    const local = createProductFunnel(() => true);
    FUNNEL_EVENTS.forEach((event) => local.record(event));
    expect(local.snapshot()).toEqual([]);
  });
  it('keeps only one event/day per run, not private content or persistent identifiers', () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const storage = vi.spyOn(localStorage, 'setItem');
    const local = createProductFunnel(
      () => true,
      () => new Date('2026-09-26T11:00:00Z'),
    );
    local.setConsent(true);
    for (let n = 0; n < 20; n++) FUNNEL_EVENTS.forEach((event) => local.record(event));
    local.record('PRIVATE-DIARY' as never);
    const snapshot = local.snapshot();
    expect(snapshot).toHaveLength(FUNNEL_EVENTS.length);
    expect(
      snapshot.every((entry) => Object.keys(entry).join(',') === 'event,dayUtc'),
    ).toBe(true);
    expect(snapshot.every((entry) => entry.dayUtc === '2026-09-26')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /PRIVATE|token|email|visitor|source|scriptText/,
    );
    snapshot.pop();
    expect(local.snapshot()).toHaveLength(FUNNEL_EVENTS.length);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it('erases on withdrawal and rejects callbacks from before consent or a prior run', () => {
    const local = createProductFunnel(() => true);
    const beforeConsent = local.capture();
    local.setConsent(true);
    beforeConsent('script_generated');
    const old = local.capture();
    local.setConsent(false);
    expect(local.snapshot()).toEqual([]);
    local.setConsent(true);
    old('audio_finished');
    expect(local.snapshot().map((x) => x.event)).toEqual(['entry']);
  });
  it('never enables the UI or collection in production, even with the preview flag', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_PRODUCT_FUNNEL_PREVIEW', 'true');
    render(<ProductFunnelPreview />);
    act(() => productFunnel.setConsent(true));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(productFunnel.snapshot()).toEqual([]);
  });
  it('offers an unchecked optional preview and visible local observations', () => {
    enablePreview();
    render(<ProductFunnelPreview />);
    const consent = screen.getByRole('checkbox');
    expect(consent).not.toBeChecked();
    fireEvent.click(consent);
    act(() => productFunnel.record('questionnaire_started'));
    expect(screen.getByText(/questionnaire_started/)).toBeInTheDocument();
    fireEvent.click(consent);
    expect(productFunnel.snapshot()).toEqual([]);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
  it.each(['deleteSession', 'resetToWelcome'] as const)(
    'clears consent and observations on %s',
    async (method) => {
      enablePreview();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue({ ok: true, json: async () => ({ aiEnabled: false }) }),
      );
      const { result } = renderHook(() => useSession());
      await act(async () => {});
      act(() => productFunnel.setConsent(true));
      act(() => result.current[method]());
      expect(productFunnel.isConsented()).toBe(false);
      expect(productFunnel.snapshot()).toEqual([]);
    },
  );
  it('observes questionnaire navigation without recording answers or sending analytics', async () => {
    enablePreview();
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', '');
    const network = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ aiEnabled: false }) });
    vi.stubGlobal('fetch', network);
    render(<App />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('checkbox', { name: /permito registrar/i }));
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /permito usar mis respuestas/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^continuar$/i }));
    fireEvent.click(screen.getByLabelText(/ahora, en este momento/i));
    fireEvent.click(screen.getByLabelText(/^acelerado$/i));
    fireEvent.click(screen.getByLabelText(/calmar el ritmo/i));
    fireEvent.click(screen.getByLabelText(/experiencia básica/i));
    fireEvent.click(screen.getByLabelText(/respiración natural/i));
    fireEvent.click(screen.getByRole('button', { name: /personalizar un poco más/i }));
    // Generation is exercised through the real hook below; no audio service is needed.
    expect(productFunnel.snapshot().map((x) => x.event)).toEqual([
      'entry',
      'questionnaire_started',
    ]);
    expect(
      network.mock.calls.every(([url]) => !String(url).includes('/api/visit')),
    ).toBe(true);
  });
  it('records successful generation and feedback independently without rating values', async () => {
    enablePreview();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aiEnabled: false }) }),
    );
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
    act(() => result.current.tryGenerate());
    await waitFor(() => expect(result.current.session.script).not.toBeNull());
    act(() => result.current.setRating(4));
    act(() => result.current.setWouldRepeat(true));
    expect(productFunnel.snapshot().map((x) => x.event)).toContain('script_generated');
    expect(
      productFunnel.snapshot().filter((x) => x.event === 'feedback_given'),
    ).toHaveLength(1);
  });
  it('records only a generic script error when generation throws', async () => {
    enablePreview();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aiEnabled: false }) }),
    );
    const provider = scriptProvider.createLocalProvider();
    vi.spyOn(scriptProvider, 'createLocalProvider').mockReturnValue({
      name: provider.name,
      engine: provider.engine,
      isAvailable: async () => true,
      generate: vi.fn().mockRejectedValue(new Error('PRIVATE-PROMPT')),
    });
    const { result } = renderHook(() => useSession());
    act(() => productFunnel.setConsent(true));
    act(() => result.current.updateConsent({ sessionProcessing: true }));
    act(() => result.current.tryGenerate());
    await waitFor(() =>
      expect(productFunnel.snapshot().map((x) => x.event)).toContain('script_error'),
    );
    expect(JSON.stringify(productFunnel.snapshot())).not.toContain('PRIVATE');
    expect(productFunnel.snapshot().map((x) => x.event)).not.toContain(
      'script_generated',
    );
  });
});

describe('actual audio callbacks, not play clicks or closing screen', () => {
  it('requires every segment start/end followed by natural completion', () => {
    const emit = vi.fn();
    const run = createAudioObservation(2, emit);
    run.complete();
    expect(emit).not.toHaveBeenCalled();
    run.started(0);
    run.ended(0);
    run.complete();
    expect(emit).not.toHaveBeenCalledWith('audio_finished');
    run.started(1);
    run.ended(1);
    run.complete();
    run.complete();
    expect(
      emit.mock.calls.filter(([event]) => event === 'audio_finished'),
    ).toHaveLength(1);
  });
  it.each(['cancel', 'seek', 'error', 'missing-start', 'skip'] as const)(
    'does not mark complete after %s',
    (cause) => {
      const emit = vi.fn();
      const run = createAudioObservation(1, emit);
      if (cause !== 'missing-start') run.started(0);
      if (cause === 'cancel' || cause === 'seek') run.invalidate();
      if (cause === 'error') run.failed();
      run.ended(cause === 'skip' ? 1 : 0);
      run.complete();
      expect(emit).not.toHaveBeenCalledWith('audio_finished');
    },
  );
  it('empty script is not a completed meditation', () => {
    const emit = vi.fn();
    createAudioObservation(0, emit).complete();
    expect(emit).not.toHaveBeenCalled();
  });
});
