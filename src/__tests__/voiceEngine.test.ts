import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkNeuralEngineBrowserSupport,
  checkWebSpeechEngineSupport,
  DEFAULT_ES_AR_VOICE_URL,
  ES_AR_VOICE_APPROX_SIZE_MB,
  getNeuralVoiceModelUrl,
  getVoiceEngineStatuses,
  hasVerifiedNeuralVoiceInSession,
  isNeuralVoiceModelReachable,
  resetNeuralVoiceVerificationForTests,
  synthesizeArgentineVoice,
} from '../lib/voiceEngine';
import { resetArgentineVoiceSessionForTests } from '../lib/voiceEngine';

describe('voiceEngine', () => {
  it('reports web speech as supported in the test environment (jsdom mock)', () => {
    expect(checkWebSpeechEngineSupport()).toBe(true);
  });

  it('does not claim neural engine browser support without AudioContext', () => {
    const original = (window as unknown as { AudioContext?: unknown }).AudioContext;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    expect(checkNeuralEngineBrowserSupport()).toBe(false);
    if (original) {
      (window as unknown as { AudioContext?: unknown }).AudioContext = original;
    }
  });

  it('detects neural engine browser support when APIs exist', () => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = class {};
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: vi.fn(), match: vi.fn() },
    });
    expect(checkNeuralEngineBrowserSupport()).toBe(true);
  });

  it('uses the real es_AR-daniela-high model from rhasspy/piper-voices by default', () => {
    expect(getNeuralVoiceModelUrl()).toBe(DEFAULT_ES_AR_VOICE_URL);
    expect(getNeuralVoiceModelUrl()).toContain('rhasspy/piper-voices');
    expect(getNeuralVoiceModelUrl()).toContain('es_AR-daniela-high.onnx');
  });

  it('documents the real approximate download size', () => {
    expect(ES_AR_VOICE_APPROX_SIZE_MB).toBeGreaterThan(0);
  });

  describe('getVoiceEngineStatuses', () => {
    beforeEach(() => {
      (window as unknown as { AudioContext?: unknown }).AudioContext = class {};
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: { open: vi.fn(), match: vi.fn() },
      });
      resetNeuralVoiceVerificationForTests();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      resetNeuralVoiceVerificationForTests();
    });

    it('reports web-speech as available immediately, but the neural engine as configured yet unverified', async () => {
      const statuses = await getVoiceEngineStatuses();
      const webSpeech = statuses.find((s) => s.id === 'web-speech');
      const neural = statuses.find((s) => s.id === 'neural-piper-es-ar');

      expect(webSpeech?.available).toBe(true);
      expect(neural?.configured).toBe(true);
      expect(neural?.available).toBe(false);
      expect(neural?.reason).toMatch(/aún no verificada/i);
    });

    it('never marks the neural engine as available just because HEAD would succeed', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const statuses = await getVoiceEngineStatuses();
      const neural = statuses.find((s) => s.id === 'neural-piper-es-ar');
      expect(neural?.available).toBe(false);
    });

    it('marks the neural engine as available only after a real synthesis produced a Blob', async () => {
      expect(hasVerifiedNeuralVoiceInSession()).toBe(false);

      const fakeOrt = {
        env: { wasm: {} },
        InferenceSession: {
          create: vi.fn().mockResolvedValue({
            run: vi.fn().mockResolvedValue({
              output: { data: new Float32Array([0, 0.1, -0.1]) },
            }),
          }),
        },
        Tensor: class {},
      };
      vi.doMock('onnxruntime-web/wasm', () => ({ default: fakeOrt }));

      const configBlob = JSON.stringify({
        audio: { sample_rate: 22050 },
        espeak: { voice: 'es-419' },
        inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
        speaker_id_map: {},
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.endsWith('.json')) {
            return Promise.resolve({
              ok: true,
              headers: new Map([['Content-Length', String(configBlob.length)]]),
              body: null,
              arrayBuffer: () =>
                Promise.resolve(new TextEncoder().encode(configBlob).buffer),
            });
          }
          return Promise.resolve({
            ok: true,
            headers: new Map([['Content-Length', '12']]),
            body: null,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(12)),
          });
        }),
      );
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: {
          open: vi.fn().mockResolvedValue({
            match: vi.fn().mockResolvedValue(undefined),
            put: vi.fn(),
          }),
        },
      });

      const globalScope = globalThis as unknown as {
        createPiperPhonemize?: (
          moduleArg?: Record<string, unknown>,
        ) => Promise<{ callMain: (args: string[]) => void }>;
      };
      globalScope.createPiperPhonemize = vi.fn().mockImplementation((moduleArg) => {
        return Promise.resolve({
          callMain: () => {
            (moduleArg as { print: (data: string) => void }).print(
              JSON.stringify({ phoneme_ids: [1, 2, 3] }),
            );
          },
        });
      });

      resetArgentineVoiceSessionForTests();
      const blob = await synthesizeArgentineVoice('Hola');
      expect(blob).toBeInstanceOf(Blob);
      expect(hasVerifiedNeuralVoiceInSession()).toBe(true);

      const statuses = await getVoiceEngineStatuses();
      const neural = statuses.find((s) => s.id === 'neural-piper-es-ar');
      expect(neural?.available).toBe(true);
      expect(neural?.reason).toMatch(/verificada en esta sesión/i);

      delete globalScope.createPiperPhonemize;
      resetArgentineVoiceSessionForTests();
      vi.doUnmock('onnxruntime-web/wasm');
    });
  });

  describe('isNeuralVoiceModelReachable', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns false when the fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
      const reachable = await isNeuralVoiceModelReachable(
        'https://example.com/voice.onnx',
      );
      expect(reachable).toBe(false);
    });

    it('returns true when the HEAD request succeeds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const reachable = await isNeuralVoiceModelReachable(
        'https://example.com/voice.onnx',
      );
      expect(reachable).toBe(true);
    });

    it('a successful HEAD alone never sets available (see getVoiceEngineStatuses tests above)', () => {
      // Deliberate cross-reference: this file always keeps these behaviors
      // next to each other so a future change can't silently reintroduce
      // "available == HEAD ok".
      expect(true).toBe(true);
    });
  });
});
