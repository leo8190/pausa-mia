import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithProgress,
  pcmToWav,
  splitIntoChunks,
  synthesizeWithSession,
  type OrtLike,
  type OrtSessionLike,
  type PiperModelConfig,
} from '../lib/piperEngine';

describe('piperEngine', () => {
  describe('splitIntoChunks', () => {
    it('returns an empty array for empty text', () => {
      expect(splitIntoChunks('   ')).toEqual([]);
    });

    it('keeps short text as a single chunk', () => {
      expect(splitIntoChunks('Hola, respirá hondo.')).toEqual(['Hola, respirá hondo.']);
    });

    it('splits long text on sentence boundaries without losing content', () => {
      const sentence = 'Respirá profundamente y notá el aire entrando. ';
      const text = sentence.repeat(20);
      const chunks = splitIntoChunks(text, 100);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100 + sentence.length);
      }
      expect(chunks.join(' ')).toContain('Respirá profundamente');
    });

    it('splits a single very long sentence by words', () => {
      const words = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(' ');
      const chunks = splitIntoChunks(words, 50);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(60);
      }
    });
  });

  describe('pcmToWav', () => {
    it('produces a valid RIFF/WAVE header for a given sample rate', () => {
      const pcm = new Float32Array([0, 0.5, -0.5, 1, -1]);
      const buffer = pcmToWav(pcm, 22050);
      const view = new DataView(buffer);
      expect(view.getUint32(0, true)).toBe(0x46464952); // 'RIFF'
      expect(view.getUint32(8, true)).toBe(0x45564157); // 'WAVE'
      expect(view.getUint32(24, true)).toBe(22050); // sample rate
      expect(buffer.byteLength).toBe(44 + pcm.length * 2);
    });

    it('clamps out-of-range samples instead of wrapping', () => {
      const pcm = new Float32Array([2, -2]);
      const buffer = pcmToWav(pcm, 16000);
      const view = new DataView(buffer);
      expect(view.getInt16(44, true)).toBe(32767);
      expect(view.getInt16(46, true)).toBe(-32768);
    });
  });

  describe('fetchWithProgress', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('reports progress while streaming and returns the merged buffer', async () => {
      const chunk1 = new Uint8Array([1, 2, 3]);
      const chunk2 = new Uint8Array([4, 5]);
      let call = 0;
      const reader = {
        read: vi.fn().mockImplementation(() => {
          call += 1;
          if (call === 1) return Promise.resolve({ done: false, value: chunk1 });
          if (call === 2) return Promise.resolve({ done: false, value: chunk2 });
          return Promise.resolve({ done: true, value: undefined });
        }),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (key: string) => (key === 'Content-Length' ? '5' : null) },
          body: { getReader: () => reader },
        }),
      );

      const progressUpdates: { loaded: number; total: number }[] = [];
      const buffer = await fetchWithProgress('https://example.com/model.onnx', (p) =>
        progressUpdates.push(p),
      );

      expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
      expect(progressUpdates).toEqual([
        { loaded: 3, total: 5 },
        { loaded: 5, total: 5 },
      ]);
    });

    it('throws a descriptive error on a non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      await expect(
        fetchWithProgress('https://example.com/missing.onnx'),
      ).rejects.toThrow(/404/);
    });
  });

  describe('synthesizeWithSession', () => {
    function makeModelConfig(
      overrides: Partial<PiperModelConfig> = {},
    ): PiperModelConfig {
      return {
        audio: { sample_rate: 22050 },
        espeak: { voice: 'es-419' },
        inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
        speaker_id_map: {},
        ...overrides,
      };
    }

    it('rejects empty text before touching the ONNX session', async () => {
      const ortSession: OrtSessionLike = { run: vi.fn() };
      const ort: OrtLike = {
        InferenceSession: { create: vi.fn() },
        Tensor: class {} as unknown as OrtLike['Tensor'],
      };
      await expect(
        synthesizeWithSession('   ', {
          ort,
          ortSession,
          modelConfig: makeModelConfig(),
          phonemize: vi.fn(),
        }),
      ).rejects.toThrow(/no hay texto/i);
      expect(ortSession.run).not.toHaveBeenCalled();
    });

    it('runs one inference per chunk and returns a real audio Blob', async () => {
      const run = vi
        .fn()
        .mockResolvedValue({ output: { data: new Float32Array([0, 0.2, -0.2]) } });
      const ortSession: OrtSessionLike = { run };
      const ort: OrtLike = {
        InferenceSession: { create: vi.fn() },
        Tensor: class {
          constructor(
            public type: string,
            public data: unknown,
            public dims?: number[],
          ) {}
        } as unknown as OrtLike['Tensor'],
      };
      const phonemize = vi.fn().mockResolvedValue([1, 2, 3]);

      const blob = await synthesizeWithSession('Hola. Respirá.', {
        ort,
        ortSession,
        modelConfig: makeModelConfig(),
        phonemize,
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/x-wav');
      expect(run).toHaveBeenCalledTimes(1);
      expect(phonemize).toHaveBeenCalledWith('Hola. Respirá.', 'es-419');
    });

    it('adds a speaker id tensor only when the model declares multiple speakers', async () => {
      const run = vi
        .fn()
        .mockResolvedValue({ output: { data: new Float32Array([0]) } });
      const ortSession: OrtSessionLike = { run };
      const ort: OrtLike = {
        InferenceSession: { create: vi.fn() },
        Tensor: class {
          constructor(
            public type: string,
            public data: unknown,
            public dims?: number[],
          ) {}
        } as unknown as OrtLike['Tensor'],
      };
      await synthesizeWithSession('Hola', {
        ort,
        ortSession,
        modelConfig: makeModelConfig({ speaker_id_map: { daniela: 0 } }),
        phonemize: vi.fn().mockResolvedValue([1]),
      });
      const feeds = run.mock.calls[0][0] as Record<string, unknown>;
      expect(feeds.sid).toBeDefined();
    });
  });
});
