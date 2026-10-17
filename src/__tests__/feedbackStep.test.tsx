import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackStep } from '../components/FeedbackStep';
import type { SessionApi } from '../hooks/useSession';
import { createInitialSession } from '../lib/session';
import { resetVisitorPingForTests } from '../lib/visitorPing';
import { productFunnel } from '../lib/productFunnel';
import {
  clearGuestProgress,
  saveGuestProgress,
} from '../lib/guestProgressStorage';
import { clearSoftAccountNudge } from '../lib/softAccountNudgeStorage';

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function FeedbackHarness() {
  const [wouldRepeat, setWouldRepeat] = useState<boolean | null>(null);
  const sessionApi = {
    session: {
      ...createInitialSession(),
      rating: null,
      selectedPrice: null,
      wouldRepeat,
    },
    setWouldRepeat,
    resetToWelcome: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionApi;

  return <FeedbackStep sessionApi={sessionApi} />;
}

describe('FeedbackStep repeat choice', () => {
  beforeEach(() => {
    clearGuestProgress();
    clearSoftAccountNudge();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ authenticated: false, mode: 'guest' })),
    );
  });

  afterEach(() => {
    productFunnel.setConsent(false);
    vi.unstubAllEnvs();
    resetVisitorPingForTests();
    clearGuestProgress();
    clearSoftAccountNudge();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the price survey optional and clearly without a charge', () => {
    render(<FeedbackHarness />);
    const details = screen
      .getByText(/ayudanos a pensar futuras opciones/i)
      .closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText(/ayudanos a pensar futuras opciones/i));
    expect(details).toHaveAttribute('open');
    expect(
      screen.getByText(/encuesta opcional. no se cobra nada/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/hipótesis|configuración real|fuentes que podés agregar/i),
    ).not.toBeInTheDocument();
  });

  it('offers voluntary comments without requiring a rating or payment', () => {
    render(<FeedbackHarness />);
    expect(
      screen.getByRole('region', { name: '¿Qué mejorarías?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Escribir comentario por correo' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:leonardo23322@gmail.com?'),
    );
    expect(
      screen.getByRole('button', { name: 'Copiar dirección de contacto' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Nueva sesión' })).toBeEnabled();
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

  it('observa cierre, no audio terminado ni session_complete, y no envía datos', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PRODUCT_FUNNEL_PREVIEW', 'true');
    productFunnel.setConsent(true);
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    localStorage.setItem('pausa-mia-vid', id);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchImpl);

    render(<FeedbackHarness />);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(productFunnel.snapshot().map(({ event }) => event)).toEqual([
      'entry',
      'closing_reached',
    ]);
  });
});

describe('FeedbackStep soft account nudge', () => {
  beforeEach(() => {
    clearGuestProgress();
    clearSoftAccountNudge();
  });

  afterEach(() => {
    clearGuestProgress();
    clearSoftAccountNudge();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no muestra el nudge sin progreso con sentido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ authenticated: false, mode: 'guest' })),
    );
    render(<FeedbackHarness />);
    await waitFor(() =>
      expect(screen.queryByText(/guardar esta pausa en una cuenta/i)).toBeNull(),
    );
  });

  it('muestra el nudge una vez tras meditación completada y Más tarde lo oculta', async () => {
    saveGuestProgress({
      duration: 5,
      voiceVariant: 'es-neutro',
      intention: '',
      style: '',
      moment: '',
      experience: '',
      step: 'feedback',
      meditationCompleted: true,
      meditationCount: 1,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ authenticated: false, mode: 'guest' })),
    );

    const { unmount } = render(<FeedbackHarness />);
    expect(
      await screen.findByText(/guardar esta pausa en una cuenta/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^crear cuenta$/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^más tarde$/i }));
    expect(
      screen.queryByText(/guardar esta pausa en una cuenta/i),
    ).toBeNull();

    unmount();
    render(<FeedbackHarness />);
    await waitFor(() =>
      expect(screen.queryByText(/guardar esta pausa en una cuenta/i)).toBeNull(),
    );
  });

  it('al elegir Crear cuenta muestra AccountPanel abierto debajo', async () => {
    saveGuestProgress({
      duration: 3,
      voiceVariant: 'es-AR',
      intention: '',
      style: '',
      moment: '',
      experience: '',
      step: 'feedback',
      meditationCompleted: true,
      meditationCount: 1,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ authenticated: false, mode: 'guest' })),
    );

    render(<FeedbackHarness />);
    expect(
      await screen.findByRole('button', { name: /^crear cuenta$/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^crear cuenta$/i }));
    expect(await screen.findByText(/cuenta \(opcional\)/i)).toBeInTheDocument();
    const panels = document.querySelectorAll('.soft-account-nudge-panel .account-panel');
    expect(panels.length).toBeGreaterThan(0);
    expect(panels[0]).toHaveAttribute('open');
  });

  it('oculta el nudge si el backend de cuentas no está disponible', async () => {
    saveGuestProgress({
      duration: 5,
      voiceVariant: 'es-neutro',
      intention: '',
      style: '',
      moment: '',
      experience: '',
      step: 'feedback',
      meditationCompleted: true,
      meditationCount: 2,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network'))),
    );

    render(<FeedbackHarness />);
    await waitFor(() =>
      expect(screen.queryByText(/guardar esta pausa en una cuenta/i)).toBeNull(),
    );
  });
});
