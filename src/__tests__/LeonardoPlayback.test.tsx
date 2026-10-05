import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { LeonardoPlayback } from '../components/LeonardoPlayback';
import { CheckInStep } from '../components/CheckInStep';
import { createBlankCheckIn } from '../lib/session';
import type { SessionApi } from '../hooks/useSession';
const player = vi.hoisted(() => ({
  state: { status: 'idle', currentSegmentIndex: 0, completed: 0, error: null },
  nativeReady: true,
  native: true,
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  mountAudio: vi.fn(),
}));
vi.mock('../hooks/useLeonardoVoicePlayer', () => ({
  useLeonardoVoicePlayer: () => player,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function api() {
  return {
    session: {
      checkIn: { ...createBlankCheckIn(), voiceVariant: 'leonardo' },
      script: { segments: [{ text: 'Texto elegido.', pauseAfterMs: 1000 }] },
      autoStartPlayback: true,
    },
    clearAutoStartPlayback: vi.fn(),
    setStep: vi.fn(),
    deleteSession: vi.fn(),
    updateCheckIn: vi.fn(),
  } as unknown as SessionApi;
}
describe('Leonardo voice in the actual session UI', () => {
  it('requires a new, unchecked text-transmission consent before playing', () => {
    const sessionApi = api();
    render(<LeonardoPlayback sessionApi={sessionApi} />);
    const button = screen.getByRole('button', { name: 'Reproducir' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(player.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button);
    expect(player.play).toHaveBeenCalledWith(sessionApi.session.script!.segments, true);
  });
  it('shows the real voice preview but keeps live synthesis unavailable without its server', () => {
    vi.stubEnv('VITE_LEONARDO_TTS_ENDPOINT', '');
    const sessionApi = api();
    render(<CheckInStep sessionApi={sessionApi} />);
    expect(screen.getByRole('radio', { name: 'Voz de Leonardo' })).toBeDisabled();
    expect(
      screen.getByText('Escuchar una muestra de la voz de Leonardo'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Muestra de la voz de Leonardo')).toHaveAttribute(
      'src',
      expect.stringContaining('leonardo-preview.mp3'),
    );
  });
});
