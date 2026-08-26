import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeedbackStep } from '../components/FeedbackStep';
import type { SessionApi } from '../hooks/useSession';
import type { SessionState } from '../types';
import { resetVisitorPingForTests } from '../lib/visitorPing';

function FeedbackHarness() {
  const [wouldRepeat, setWouldRepeat] = useState<boolean | null>(null);
  const sessionApi = {
    session: {
      rating: null,
      selectedPrice: null,
      wouldRepeat,
    } as SessionState,
    setWouldRepeat,
    resetToWelcome: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionApi;

  return <FeedbackStep sessionApi={sessionApi} />;
}

describe('FeedbackStep repeat choice', () => {
  afterEach(() => {
    resetVisitorPingForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('starts with both options unpressed and without the selected visual state', () => {
    render(<FeedbackHarness />);

    const yes = screen.getByRole('button', { name: 'Sí' });
    const no = screen.getByRole('button', { name: 'No' });

    expect(yes).toHaveAttribute('aria-pressed', 'false');
    expect(no).toHaveAttribute('aria-pressed', 'false');
    expect(yes).toHaveClass('choice-btn');
    expect(no).toHaveClass('choice-btn');
    expect(yes).not.toHaveClass('selected');
    expect(no).not.toHaveClass('selected');
    expect(yes).not.toHaveClass('btn-primary');
    expect(yes).not.toHaveClass('btn-secondary');
    expect(no).not.toHaveClass('btn-primary');
    expect(no).not.toHaveClass('btn-secondary');
  });

  it('marks Sí as the only pressed and selected option', () => {
    render(<FeedbackHarness />);

    const yes = screen.getByRole('button', { name: 'Sí' });
    const no = screen.getByRole('button', { name: 'No' });

    fireEvent.click(yes);

    expect(yes).toHaveAttribute('aria-pressed', 'true');
    expect(no).toHaveAttribute('aria-pressed', 'false');
    expect(yes).toHaveClass('selected');
    expect(no).not.toHaveClass('selected');
  });

  it('moves the pressed and selected state from Sí to No', () => {
    render(<FeedbackHarness />);

    const yes = screen.getByRole('button', { name: 'Sí' });
    const no = screen.getByRole('button', { name: 'No' });

    fireEvent.click(yes);
    fireEvent.click(no);

    expect(yes).toHaveAttribute('aria-pressed', 'false');
    expect(no).toHaveAttribute('aria-pressed', 'true');
    expect(yes).not.toHaveClass('selected');
    expect(no).toHaveClass('selected');
  });

  it('emite session_complete al llegar al cierre (sin cuestionario)', () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    localStorage.setItem('pausa-mia-vid', id);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchImpl);

    render(<FeedbackHarness />);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/visit$/);
    expect(JSON.parse(init.body as string)).toEqual({
      id,
      event: 'session_complete',
    });
  });
});
