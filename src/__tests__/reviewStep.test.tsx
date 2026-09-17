import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewStep } from '../components/ReviewStep';
import type { SessionApi } from '../hooks/useSession';
import { createInitialSession } from '../lib/session';

function sessionApi(fallback = false): SessionApi {
  return {
    session: {
      ...createInitialSession(),
      scriptFallbackUsed: fallback,
      script: {
        title: 'Una pausa para vos',
        intentionLabel: 'Descansar',
        targetDuration: 5,
        estimatedMinutes: 5,
        usedDetails: ['name', 'style'],
        engine: 'local',
        fullText: 'Tomate un momento.',
        segments: [{ text: 'Tomate un momento.', pauseAfterMs: 1000 }],
      },
    },
    setStep: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionApi;
}

describe('ReviewStep simple meditation preview', () => {
  it('keeps the script, duration and playback without internal labels', () => {
    const api = sessionApi();
    render(<ReviewStep sessionApi={api} />);

    expect(screen.getByText('Tomate un momento.')).toBeInTheDocument();
    expect(screen.getByText(/duración aproximada: 5 minutos/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/personalizado con:|objetivo:|±|guion preparado para vos/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reproducir audio/i }));
    expect(api.setStep).toHaveBeenCalledWith('playback');
  });

  it('still tells the user when requested AI was unavailable', () => {
    render(<ReviewStep sessionApi={sessionApi(true)} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /no pudimos usar la inteligencia artificial/i,
    );
  });
});
