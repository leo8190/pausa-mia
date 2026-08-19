import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useArgentineVoicePlayer } from '../hooks/useArgentineVoicePlayer';
import * as voiceEngine from '../lib/voiceEngine';
import * as remoteVoice from '../lib/remoteVoiceService';

describe('useArgentineVoicePlayer — remoto', () => {
  beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    if (!('createObjectURL' in URL)) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(),
        configurable: true,
      });
    }
    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        configurable: true,
      });
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:remote-mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prepare remoto exige endpoint y no llama Piper local', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(false);
    const localSpy = vi.spyOn(voiceEngine, 'synthesizeArgentineVoice');

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));
    let ok = true;
    await act(async () => {
      ok = await result.current.prepare();
    });
    expect(ok).toBe(false);
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toMatch(/endpoint remoto/i);
    expect(localSpy).not.toHaveBeenCalled();
  });

  it('reproduce un segmento remoto con HTMLAudioElement y limpia object URLs al detener', async () => {
    vi.spyOn(remoteVoice, 'isRemoteArgentineTtsConfigured').mockReturnValue(true);
    vi.spyOn(remoteVoice, 'assertRemoteSessionTextLimits').mockImplementation(() => {});
    vi.spyOn(remoteVoice, 'synthesizeRemoteArgentineVoice').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    );

    const { result } = renderHook(() => useArgentineVoicePlayer('remote'));

    await act(async () => {
      await result.current.prepare();
    });
    expect(result.current.state.status).toBe('ready');

    await act(async () => {
      result.current.play([{ text: 'Respirá.', pauseAfterMs: 5 }]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('playing');
    });
    expect(remoteVoice.synthesizeRemoteArgentineVoice).toHaveBeenCalledWith(
      'Respirá.',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();

    act(() => {
      result.current.stop();
    });
    expect(result.current.state.status).toBe('stopped');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:remote-mock');
  });
});
