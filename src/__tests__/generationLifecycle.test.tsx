import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession, type SessionApi } from '../hooks/useSession';
import { SummaryStep } from '../components/SummaryStep';
import { AiConsentStep } from '../components/AiConsentStep';
import { CheckInStep } from '../components/CheckInStep';
import { createBlankCheckIn } from '../lib/session';
import { generateScript } from '../lib/scriptEngine';
import * as scriptEngine from '../lib/scriptEngine';
import * as providers from '../lib/scriptProvider';
import { productFunnel } from '../lib/productFunnel';

const checkIn = {
  ...createBlankCheckIn(),
  moment: 'ahora' as const,
  intention: 'descansar' as const,
  experience: 'basica' as const,
  style: 'atencion-abierta' as const,
};
const script = generateScript(checkIn, new Set(), { sessionProcessing: true });
const generated: providers.ScriptProviderResult = { script, engine: 'local' };

function deferred() {
  let resolve!: (value: providers.ScriptProviderResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<providers.ScriptProviderResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function mockProvider(generate: providers.ScriptProvider['generate']) {
  const provider: providers.ScriptProvider = {
    name: 'Prueba',
    engine: 'local',
    isAvailable: async () => true,
    generate,
  };
  vi.spyOn(providers, 'createLocalProvider').mockReturnValue(provider);
  vi.spyOn(providers, 'createAiProvider').mockReturnValue(provider);
}

function prepare(api: SessionApi) {
  api.updateConsent({ sessionProcessing: true, aiTransmission: true });
  api.updateCheckIn(checkIn);
  api.setStep('summary');
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('preparación cancelable y visible', () => {
  it('accepts one request, shows loading and finishes normally', async () => {
    const pending = deferred();
    const generate = vi.fn().mockReturnValue(pending.promise);
    mockProvider(generate);
    const { result } = renderHook(() => useSession());
    await act(async () => {});
    act(() => prepare(result.current));
    act(() => {
      expect(result.current.tryGenerate()).toBe(true);
      expect(result.current.tryGenerate()).toBe(false);
      expect(result.current.confirmAiGenerate()).toBe(false);
    });
    expect(result.current.isGenerating).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(generated));
    expect(result.current.session.step).toBe('review');
    expect(result.current.session.script).toEqual(script);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generationError).toBe('');
  });

  const cancellations: [string, (api: SessionApi) => void][] = [
    ['editar respuestas', (api) => api.updateCheckIn({ name: 'Otra prueba' })],
    ['editar contexto', (api) => api.updateContextSources([])],
    ['excluir datos', (api) => api.toggleExcluded('moment')],
    ['retirar permiso de IA', (api) => api.updateConsent({ aiTransmission: false })],
    [
      'retirar permiso de sesión',
      (api) => api.updateConsent({ sessionProcessing: false }),
    ],
    ['cambiar preparación', (api) => api.setUseAiEngine(true)],
    ['volver', (api) => api.setStep('checkin')],
    ['borrar', (api) => api.deleteSession()],
    ['reiniciar', (api) => api.resetToWelcome()],
  ];
  it.each(cancellations)('discards a late result after %s', async (_label, cancel) => {
    const pending = deferred();
    const generate = vi.fn().mockReturnValue(pending.promise);
    const observe = vi.fn();
    vi.spyOn(productFunnel, 'capture').mockReturnValue(observe);
    mockProvider(generate);
    const { result } = renderHook(() => useSession());
    await act(async () => {});
    act(() => prepare(result.current));
    act(() => result.current.confirmAiGenerate());
    const signal = generate.mock.calls[0][0].signal as AbortSignal;
    act(() => cancel(result.current));
    const afterCancel = result.current.session;
    expect(signal.aborted).toBe(true);
    expect(result.current.isGenerating).toBe(false);
    await act(async () => pending.resolve(generated));
    expect(result.current.session).toEqual(afterCancel);
    expect(result.current.session.script).toBeNull();
    expect(result.current.generationError).toBe('');
    expect(observe).not.toHaveBeenCalledWith('script_generated');
    expect(observe).not.toHaveBeenCalledWith('script_error');
  });

  it('cannot cancel or overwrite a newer request when an old request rejects', async () => {
    const old = deferred();
    const next = deferred();
    mockProvider(
      vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise),
    );
    const { result } = renderHook(() => useSession());
    await act(async () => {});
    act(() => prepare(result.current));
    act(() => result.current.tryGenerate());
    act(() => result.current.updateCheckIn({ name: 'Otra prueba' }));
    act(() => result.current.tryGenerate());
    await act(async () => old.reject(new Error('PRIVATE_DIARY_ERROR')));
    expect(result.current.isGenerating).toBe(true);
    expect(result.current.generationError).toBe('');
    await act(async () => next.resolve(generated));
    expect(result.current.session.script).toEqual(script);
    expect(result.current.isGenerating).toBe(false);
  });

  it.each(['fallo', 'guion inválido'] as const)(
    'shows a safe retry message for %s without losing answers',
    async (failure) => {
      const generate = vi.fn();
      if (failure === 'fallo')
        generate.mockRejectedValueOnce(new Error('PRIVATE_DIARY_ERROR'));
      else
        generate.mockResolvedValueOnce({
          ...generated,
          script: { ...script, fullText: '' },
        });
      generate.mockResolvedValueOnce(generated);
      mockProvider(generate);
      const { result } = renderHook(() => useSession());
      await act(async () => {});
      act(() => prepare(result.current));
      await act(async () => result.current.tryGenerate());
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.generationError).toMatch(/podés volver a intentarlo/i);
      expect(result.current.generationError).not.toMatch(/PRIVATE/);
      expect(result.current.session.checkIn).toEqual(checkIn);
      expect(result.current.session.step).toBe('summary');
      await act(async () => result.current.tryGenerate());
      expect(result.current.generationError).toBe('');
      expect(result.current.session.step).toBe('review');
    },
  );

  it('cancels on unmount and does not observe a discarded result', async () => {
    const pending = deferred();
    const generate = vi.fn().mockReturnValue(pending.promise);
    const observe = vi.fn();
    vi.spyOn(productFunnel, 'capture').mockReturnValue(observe);
    mockProvider(generate);
    const { result, unmount } = renderHook(() => useSession());
    await act(async () => {});
    act(() => prepare(result.current));
    act(() => result.current.tryGenerate());
    unmount();
    expect(generate.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => pending.resolve(generated));
    expect(observe).not.toHaveBeenCalled();
  });

  it.each(['resumen', 'permiso'] as const)(
    'announces progress and failure in %s and keeps exit available',
    async (step) => {
      const pending = deferred();
      const generate = vi.fn().mockReturnValue(pending.promise);
      mockProvider(generate);
      let api!: SessionApi;
      function Harness() {
        api = useSession();
        return step === 'resumen' ? (
          <SummaryStep sessionApi={api} />
        ) : (
          <AiConsentStep sessionApi={api} />
        );
      }
      render(<Harness />);
      await act(async () => {});
      act(() => prepare(api));
      fireEvent.click(
        screen.getByRole('button', {
          name: step === 'resumen' ? /generar guion/i : /crear mi meditación con ia/i,
        }),
      );
      expect(screen.getByRole('status')).toHaveTextContent(/estamos preparando/i);
      expect(
        screen.getByRole('button', { name: /preparando tu meditación/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', {
          name: step === 'resumen' ? /editar respuestas/i : /volver al resumen/i,
        }),
      ).toBeEnabled();
      await act(async () => pending.reject(new Error('PRIVATE_ERROR')));
      expect(screen.getByRole('alert')).toHaveTextContent(/tus respuestas siguen acá/i);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: step === 'resumen' ? /generar guion/i : /crear mi meditación con ia/i,
        }),
      ).toBeEnabled();
    },
  );

  it('shows a retry message if the quick-start preparation fails', async () => {
    mockProvider(vi.fn());
    let api!: SessionApi;
    function Harness() {
      api = useSession();
      return <CheckInStep sessionApi={api} />;
    }
    render(<Harness />);
    await act(async () => {});
    act(() => prepare(api));
    vi.spyOn(scriptEngine, 'generateScript').mockImplementation(() => {
      throw new Error('PRIVATE_ERROR');
    });
    fireEvent.click(screen.getByRole('button', { name: /empezar ahora/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/podés volver a intentarlo/i);
    expect(screen.getByRole('button', { name: /empezar ahora/i })).toBeEnabled();
  });
});

describe('cancelación del proveedor de IA', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('aborts the network request and does not generate a fallback after withdrawal', async () => {
    const controller = new AbortController();
    let requestSignal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = options.signal as AbortSignal;
            requestSignal.addEventListener('abort', () =>
              reject(new DOMException('Cancelled', 'AbortError')),
            );
          }),
      ),
    );
    const fallback = vi.spyOn(providers.LocalScriptProvider.prototype, 'generate');
    const promise = new providers.AiScriptProvider().generate({
      checkIn,
      excluded: new Set(),
      sessionProcessing: true,
      aiTransmission: true,
      contextSources: [],
      signal: controller.signal,
    });
    controller.abort();
    expect(requestSignal.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fallback).not.toHaveBeenCalled();
  });
  it('never sends data from an already cancelled request', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const controller = new AbortController();
    controller.abort();
    await expect(
      new providers.AiScriptProvider().generate({
        checkIn,
        excluded: new Set(),
        sessionProcessing: true,
        aiTransmission: true,
        contextSources: [],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(network).not.toHaveBeenCalled();
  });
  it('keeps the existing safe fallback for a genuine network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    const result = await new providers.AiScriptProvider().generate({
      checkIn,
      excluded: new Set(),
      sessionProcessing: true,
      aiTransmission: true,
      contextSources: [],
      signal: new AbortController().signal,
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.engine).toBe('local');
  });
});
