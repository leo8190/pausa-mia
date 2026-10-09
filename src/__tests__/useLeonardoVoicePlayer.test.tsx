import { Blob as NodeBlob } from 'node:buffer';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useLeonardoVoicePlayer } from '../hooks/useLeonardoVoicePlayer';
import { cancelActiveSpeech } from '../lib/speechController';
const mocks = vi.hoisted(() => ({
  synthesize: vi.fn(),
  addListener: vi.fn(),
  playAudio: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  getState: vi.fn(),
}));
vi.mock('../lib/nativeVoice', () => ({
  NativeVoice: mocks,
  isNativeAndroidVoice: () => true,
}));
vi.mock('../lib/leonardoVoice', () => ({
  LEONARDO_VOICE_ID: 'db2a543de8bd431899957059671861b4',
  LEONARDO_DELIVERY_SPEED: 0.85,
  synthesizeLeonardoVoice: mocks.synthesize,
}));
const items = [{ text: 'Una pausa tranquila.', pauseAfterMs: 1200 }];
let event: (value: {
  requestId: string;
  status: 'playing' | 'paused' | 'stopped';
  currentSegmentIndex: number;
  completed?: boolean;
}) => void;
const output = () => ({
  audio: new NodeBlob([new Uint8Array([73, 68, 51, 0, 0, 0, 0, 0, 0, 0, 1])], {
    type: 'audio/mpeg',
  }),
  voiceId: 'db2a543de8bd431899957059671861b4',
  deliverySpeed: 0.85,
  provider: 'heygen',
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.synthesize.mockResolvedValue(output());
  mocks.addListener.mockImplementation((_name, handler) => {
    event = handler;
    return Promise.resolve({ remove: vi.fn().mockResolvedValue(undefined) });
  });
  for (const name of ['playAudio', 'pause', 'resume', 'stop'] as const)
    mocks[name].mockResolvedValue(undefined);
});
afterEach(cleanup);
async function ready() {
  const hook = renderHook(() => useLeonardoVoicePlayer());
  await waitFor(() => expect(hook.result.current.nativeReady).toBe(true));
  return hook;
}
describe('approved Leonardo voice playback', () => {
  it('does not send a script or audio without per-session consent', async () => {
    const hook = await ready();
    act(() => hook.result.current.play(items, false));
    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(mocks.playAudio).not.toHaveBeenCalled();
  });
  it('routes only approved prepared audio to Android, at native 1x without resynthesis', async () => {
    const hook = await ready();
    act(() => hook.result.current.play(items, true));
    await waitFor(() => expect(mocks.playAudio).toHaveBeenCalledTimes(1));
    expect(mocks.synthesize).toHaveBeenCalledWith(
      items[0].text,
      expect.objectContaining({ consent: true, signal: expect.any(AbortSignal) }),
    );
    expect(mocks.playAudio.mock.calls[0][0]).toMatchObject({
      voiceId: 'db2a543de8bd431899957059671861b4',
      deliverySpeed: 0.85,
      segments: [{ contentType: 'audio/mpeg', pauseAfterMs: 1200 }],
    });
    expect(hook.result.current.state.status).toBe('ready');
    const id = mocks.playAudio.mock.calls[0][0].requestId;
    act(() => event({ requestId: id, status: 'playing', currentSegmentIndex: 0 }));
    expect(hook.result.current.state.status).toBe('playing');
  });
  it('ignores obsolete playback events after stop and preserves audio for an explicit restart', async () => {
    const hook = await ready();
    act(() => hook.result.current.play(items, true));
    await waitFor(() => expect(mocks.playAudio).toHaveBeenCalledTimes(1));
    const old = mocks.playAudio.mock.calls[0][0].requestId;
    act(() => hook.result.current.stop());
    act(() => event({ requestId: old, status: 'playing', currentSegmentIndex: 0 }));
    expect(hook.result.current.state.status).toBe('stopped');
    act(() => hook.result.current.play(items, true));
    await waitFor(() => expect(mocks.playAudio).toHaveBeenCalledTimes(2));
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
    expect(mocks.playAudio.mock.calls[1][0].requestId).not.toBe(old);
  });
  it('cancels pending synthesis on deletion without accepting late audio', async () => {
    let complete!: (value: ReturnType<typeof output>) => void;
    mocks.synthesize.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const hook = await ready();
    act(() => hook.result.current.play(items, true));
    await waitFor(() => expect(mocks.synthesize).toHaveBeenCalledTimes(1));
    const signal = mocks.synthesize.mock.calls[0][1].signal;
    act(() => cancelActiveSpeech());
    expect(signal.aborted).toBe(true);
    await act(async () => complete(output()));
    expect(mocks.playAudio).not.toHaveBeenCalled();
    expect(hook.result.current.state.status).toBe('stopped');
  });
  it('does not substitute or retry after provider failure', async () => {
    mocks.synthesize.mockRejectedValue(new Error('unavailable'));
    const hook = await ready();
    act(() => hook.result.current.play(items, true));
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'));
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
    expect(mocks.playAudio).not.toHaveBeenCalled();
  });
  it('rejects invalid segments before any billed generation', async () => {
    const hook = await ready();
    act(() =>
      hook.result.current.play([{ text: 'x'.repeat(801), pauseAfterMs: 0 }], true),
    );
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'));
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });
});
