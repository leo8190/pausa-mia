import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  runtime: vi.fn(),
  create: vi.fn(),
  synthesize: vi.fn(),
}));

vi.mock('../lib/piperEngine', () => ({
  NEUTRAL_CADENCE_SCALE: 1.5,
  SERENE_CADENCE_SCALE: 1.6,
  fetchWithProgress: mocks.fetch,
  loadOnnxRuntime: mocks.runtime,
  synthesizeWithSession: mocks.synthesize,
  phonemizeChunk: vi.fn(),
  loadPiperPhonemizeFactory: vi.fn(),
}));

import {
  DEFAULT_NEUTRAL_VOICE_URL,
  getNeuralVoiceConfigUrl,
  getNeuralVoiceModelUrl,
  getVoiceEngineStatuses,
  hasVerifiedNeuralVoiceInSession,
  NEURAL_VOICE_RELOAD_MESSAGE,
  resetArgentineVoiceSessionForTests,
  resetNeuralVoiceVerificationForTests,
  synthesizeArgentineVoice,
  synthesizeNeutralVoice,
} from '../lib/voiceEngine';

describe('neutral neural voice', () => {
  beforeEach(async () => {
    await resetArgentineVoiceSessionForTests();
    vi.clearAllMocks();
    resetNeuralVoiceVerificationForTests();
    const assetCache = new Map<string, Response>();
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        open: vi.fn().mockResolvedValue({
          match: vi.fn(async (url: string) => assetCache.get(url)?.clone()),
          put: vi.fn(async (url: string, response: Response) => {
            assetCache.set(url, response);
          }),
        }),
      },
    });
    mocks.fetch.mockImplementation(async (url: string) =>
      url.endsWith('.json')
        ? new TextEncoder().encode(
            JSON.stringify({
              audio: { sample_rate: 22050 },
              espeak: { voice: url.includes('es_MX') ? 'es-419' : 'es-ar' },
              inference: { length_scale: 1, noise_scale: 0.667, noise_w: 0.8 },
              speaker_id_map: {},
            }),
          ).buffer
        : new ArrayBuffer(url.includes('es_MX') ? 12 : 24),
    );
    mocks.create.mockImplementation(async () => ({
      run: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
    }));
    mocks.runtime.mockResolvedValue({ InferenceSession: { create: mocks.create } });
    mocks.synthesize.mockResolvedValue(new Blob(['wave'], { type: 'audio/wav' }));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetArgentineVoiceSessionForTests();
    resetNeuralVoiceVerificationForTests();
  });

  it('uses a fixed Mexican model revision, independently of Argentine overrides', () => {
    vi.stubEnv('VITE_PIPER_ES_AR_VOICE_URL', 'https://example.com/ar.onnx');
    vi.stubEnv('VITE_PIPER_ES_AR_VOICE_CONFIG_URL', 'https://example.com/ar.json');
    expect(getNeuralVoiceModelUrl('es-neutro')).toBe(DEFAULT_NEUTRAL_VOICE_URL);
    expect(DEFAULT_NEUTRAL_VOICE_URL).toContain(
      '/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/',
    );
    expect(DEFAULT_NEUTRAL_VOICE_URL).toContain('es_MX-ald-medium.onnx');
    expect(getNeuralVoiceConfigUrl('es-neutro')).toBe(
      `${DEFAULT_NEUTRAL_VOICE_URL}.json`,
    );
    expect(getNeuralVoiceModelUrl()).toBe('https://example.com/ar.onnx');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('loads only model assets and verifies neutral synthesis without marking Argentine available', async () => {
    const blob = await synthesizeNeutralVoice('Puedes descansar a tu ritmo.');
    expect(blob.type).toBe('audio/wav');
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
      `${DEFAULT_NEUTRAL_VOICE_URL}.json`,
      DEFAULT_NEUTRAL_VOICE_URL,
    ]);
    expect(mocks.synthesize).toHaveBeenCalledWith(
      'Puedes descansar a tu ritmo.',
      expect.objectContaining({
        cadenceScale: 1.5,
        modelConfig: expect.objectContaining({ espeak: { voice: 'es-419' } }),
      }),
    );
    expect(hasVerifiedNeuralVoiceInSession('es-neutro')).toBe(true);
    expect(hasVerifiedNeuralVoiceInSession()).toBe(false);
    const statuses = await getVoiceEngineStatuses();
    expect(
      statuses.find((entry) => entry.id === 'neural-piper-es-neutral')?.available,
    ).toBe(true);
    expect(statuses.find((entry) => entry.id === 'neural-piper-es-ar')?.available).toBe(
      false,
    );
  });

  it('retains one model, releases each previous voice and reuses downloaded assets', async () => {
    await synthesizeArgentineVoice('Uno.');
    await synthesizeNeutralVoice('Dos.');
    await synthesizeArgentineVoice('Tres.');
    await synthesizeNeutralVoice('Cuatro.');
    expect(mocks.create).toHaveBeenCalledTimes(4);
    expect(mocks.create.mock.calls.map(([buffer]) => buffer.byteLength)).toEqual([
      24, 12, 24, 12,
    ]);
    const options = mocks.synthesize.mock.calls.map(([, config]) => config);
    expect(options[0].ortSession).not.toBe(options[2].ortSession);
    expect(options[1].ortSession).not.toBe(options[3].ortSession);
    expect(options[0].ortSession).not.toBe(options[1].ortSession);
    expect(options.map((entry) => entry.cadenceScale)).toEqual([1.6, 1.5, 1.6, 1.5]);
    for (const config of options.slice(0, 3))
      expect(config.ortSession.release).toHaveBeenCalledTimes(1);
    expect(options[3].ortSession.release).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it('shares one creation and serializes complete synthesis for simultaneous requests of the same voice', async () => {
    let finish!: (blob: Blob) => void;
    mocks.synthesize.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    const first = synthesizeNeutralVoice('Uno. Dos.');
    const second = synthesizeNeutralVoice('Tres.');
    try {
      await vi.waitFor(() => expect(mocks.synthesize).toHaveBeenCalledTimes(1));
      expect(mocks.create).toHaveBeenCalledTimes(1);
    } finally {
      finish(new Blob(['first']));
    }
    await Promise.all([first, second]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.synthesize).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('waits for the whole previous text and for release before loading the other model', async () => {
    let finishText!: (blob: Blob) => void;
    let finishRelease!: () => void;
    const oldSession = {
      run: vi.fn(),
      release: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishRelease = resolve;
          }),
      ),
    };
    mocks.create.mockResolvedValueOnce(oldSession);
    mocks.synthesize.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        finishText = resolve;
      }),
    );
    const first = synthesizeArgentineVoice('Una oración. Otra oración.');
    const second = synthesizeNeutralVoice('Neutro.');
    try {
      await vi.waitFor(() => expect(mocks.synthesize).toHaveBeenCalledTimes(1));
      expect(oldSession.release).not.toHaveBeenCalled();
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    } finally {
      finishText(new Blob(['first']));
    }
    await first;
    try {
      await vi.waitFor(() => expect(oldSession.release).toHaveBeenCalledTimes(1));
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    } finally {
      finishRelease();
    }
    await second;
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(hasVerifiedNeuralVoiceInSession('es-neutro')).toBe(true);
  });

  it('skips an aborted queued request without eviction or downloads and lets the next one run', async () => {
    let finish!: (blob: Blob) => void;
    mocks.synthesize.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    const first = synthesizeArgentineVoice('Primera.');
    const controller = new AbortController();
    const canceled = synthesizeNeutralVoice(
      'Descartado.',
      undefined,
      controller.signal,
    );
    const rejected = expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    const third = synthesizeArgentineVoice('Tercera.');
    try {
      await vi.waitFor(() => expect(mocks.synthesize).toHaveBeenCalledTimes(1));
      controller.abort();
    } finally {
      finish(new Blob(['first']));
    }
    await first;
    await rejected;
    await third;
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.synthesize.mock.calls.map(([text]) => text)).toEqual([
      'Primera.',
      'Tercera.',
    ]);
    expect(mocks.synthesize.mock.calls[0][1].ortSession.release).not.toHaveBeenCalled();
    expect(hasVerifiedNeuralVoiceInSession('es-neutro')).toBe(false);
  });

  it('finishes a canceled creation before releasing it and starting the next voice', async () => {
    let finishCreate!: (session: unknown) => void;
    mocks.create.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCreate = resolve;
      }),
    );
    const oldSession = { run: vi.fn(), release: vi.fn().mockResolvedValue(undefined) };
    const controller = new AbortController();
    const first = synthesizeArgentineVoice('Anterior.', undefined, controller.signal);
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const next = synthesizeNeutralVoice('Actual.');
    try {
      await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      controller.abort();
      expect(oldSession.release).not.toHaveBeenCalled();
    } finally {
      finishCreate(oldSession);
    }
    await rejection;
    await next;
    expect(oldSession.release).toHaveBeenCalledTimes(1);
    expect(mocks.synthesize.mock.calls.map(([text]) => text)).toEqual(['Actual.']);
    expect(hasVerifiedNeuralVoiceInSession()).toBe(false);
  });

  it('blocks further local allocations after release failure and shows no private SDK error', async () => {
    const oldSession = {
      run: vi.fn(),
      release: vi.fn().mockRejectedValue(new Error('PRIVATE INTERNAL ERROR')),
    };
    mocks.create.mockResolvedValueOnce(oldSession);
    await synthesizeArgentineVoice('Uno.');
    await expect(synthesizeNeutralVoice('Dos.')).rejects.toThrow(
      NEURAL_VOICE_RELOAD_MESSAGE,
    );
    await expect(synthesizeArgentineVoice('Tres.')).rejects.toThrow(
      NEURAL_VOICE_RELOAD_MESSAGE,
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(oldSession.release).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(hasVerifiedNeuralVoiceInSession('es-neutro')).toBe(false);
  });

  it('does not poison the queue after creation or synthesis fails', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Creation failed'));
    await expect(synthesizeArgentineVoice('Uno.')).rejects.toThrow('Creation failed');
    mocks.synthesize.mockRejectedValueOnce(new Error('Synthesis failed'));
    await expect(synthesizeNeutralVoice('Dos.')).rejects.toThrow('Synthesis failed');
    await expect(synthesizeNeutralVoice('Tres.')).resolves.toBeInstanceOf(Blob);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(hasVerifiedNeuralVoiceInSession('es-neutro')).toBe(true);
  });

  it('makes no request after an already canceled preparation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      synthesizeNeutralVoice('Uno.', undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it('discards an inference that finishes after cancellation instead of verifying it', async () => {
    let resolve!: (blob: Blob) => void;
    mocks.synthesize.mockReturnValueOnce(
      new Promise<Blob>((done) => {
        resolve = done;
      }),
    );
    const controller = new AbortController();
    const request = synthesizeNeutralVoice('Uno.', undefined, controller.signal);
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(mocks.synthesize).toHaveBeenCalled());
    controller.abort();
    resolve(new Blob(['late-wave']));
    await rejection;
    expect(hasVerifiedNeuralVoiceInSession('es-neutro')).toBe(false);
  });
});
