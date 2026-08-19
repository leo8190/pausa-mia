import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkNeuralEngineBrowserSupport,
  checkWebSpeechEngineSupport,
  getNeuralVoiceModelUrl,
  getVoiceEngineStatuses,
  isNeuralVoiceModelReachable,
} from '../lib/voiceEngine';

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

  it('returns null model url when not configured', () => {
    expect(getNeuralVoiceModelUrl()).toBeNull();
  });

  describe('getVoiceEngineStatuses', () => {
    beforeEach(() => {
      (window as unknown as { AudioContext?: unknown }).AudioContext = class {};
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: { open: vi.fn(), match: vi.fn() },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('reports web-speech engine as available and neural engine honestly unavailable without a configured model', async () => {
      const statuses = await getVoiceEngineStatuses();
      const webSpeech = statuses.find((s) => s.id === 'web-speech');
      const neural = statuses.find((s) => s.id === 'neural-piper-es-ar');

      expect(webSpeech?.available).toBe(true);
      expect(neural?.available).toBe(false);
      expect(neural?.configured).toBe(false);
      expect(neural?.reason).toMatch(/no hay un modelo/i);
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
  });
});
