import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackLoader } from '../components/PlaybackLoader';
import type { SessionApi } from '../hooks/useSession';

const load = vi.hoisted(() => vi.fn());
vi.mock('../lib/playbackChunk', () => ({ loadPlaybackStep: load }));

function sessionApi() {
  return {
    session: {
      script: { segments: [{ text: 'Tu guion sigue acá.', pauseAfterMs: 1000 }] },
      autoStartPlayback: true,
    },
    setStep: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionApi;
}

beforeEach(() => {
  load.mockReset();
});
afterEach(cleanup);

describe('playback download recovery', () => {
  it('keeps reading and editing available while a download is pending', () => {
    load.mockReturnValue(new Promise(() => {}));
    const api = sessionApi();
    render(<PlaybackLoader sessionApi={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Leer mi meditación' }));
    expect(api.setStep).toHaveBeenLastCalledWith('review');
    fireEvent.click(screen.getByRole('button', { name: 'Editar mi pausa' }));
    expect(api.setStep).toHaveBeenLastCalledWith('checkin');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('recovers only on request and passes the same session and script to the player', async () => {
    const api = sessionApi();
    const received = vi.fn();
    load.mockRejectedValueOnce(
      new TypeError('Failed to fetch dynamically imported module'),
    );
    load.mockResolvedValueOnce({
      PlaybackStep: ({ sessionApi: value }: { sessionApi: SessionApi }) => {
        received(value);
        return <p>{value.session.script!.segments[0].text}</p>;
      },
    });
    render(<PlaybackLoader sessionApi={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/se conservan/);
    expect(load).toHaveBeenCalledTimes(1);
    expect(api.deleteSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar cargar el audio' }));
    expect(await screen.findByText('Tu guion sigue acá.')).toBeInTheDocument();
    expect(received).toHaveBeenCalledWith(api);
    expect(api.session.autoStartPlayback).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('handles a second failure without entering an automatic retry loop', async () => {
    load.mockRejectedValue(new Error('offline'));
    render(<PlaybackLoader sessionApi={sessionApi()} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar cargar el audio' }));
    await screen.findByRole('alert');
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Leer mi meditación' })).toBeEnabled();
  });

  it('does not mount or start a player that arrives after leaving the screen', async () => {
    let finish!: (module: { PlaybackStep: () => null }) => void;
    load.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const player = vi.fn(() => null);
    const view = render(<PlaybackLoader sessionApi={sessionApi()} />);
    view.unmount();
    await act(async () => finish({ PlaybackStep: player }));
    expect(player).not.toHaveBeenCalled();
  });
});
