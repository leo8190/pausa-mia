import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { WelcomeStep } from '../components/WelcomeStep';
import { COLLECTIONS, RAPIDA_1_MIN } from '../lib/collections';
import {
  clearGuestProgress,
  saveGuestProgress,
} from '../lib/guestProgressStorage';
import { createInitialSession } from '../lib/session';
import type { SessionApi } from '../hooks/useSession';

function mockSessionApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    session: createInitialSession(),
    setStep: vi.fn(),
    updateCheckIn: vi.fn(),
    deleteSession: vi.fn(),
    ...overrides,
  } as unknown as SessionApi;
}

describe('WelcomeStep CTA y planes free-core', () => {
  beforeEach(() => {
    clearGuestProgress();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    clearGuestProgress();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('muestra Empezar gratis sin cuenta como único CTA primario y planes sin precios inventados', () => {
    const setStep = vi.fn();
    const { container } = render(
      <WelcomeStep sessionApi={mockSessionApi({ setStep })} />,
    );

    const cta = screen.getByRole('button', {
      name: /^empezar gratis sin cuenta$/i,
    });
    expect(cta).toBeVisible();
    expect(cta).toHaveClass('btn-primary');

    const primaryButtons = container.querySelectorAll('button.btn-primary');
    expect(primaryButtons).toHaveLength(1);
    expect(primaryButtons[0]).toHaveTextContent(/^Empezar gratis sin cuenta$/);

    const secondary = screen.getByRole('button', {
      name: /^pausa rápida · 1 min$/i,
    });
    expect(secondary).toBeVisible();
    expect(secondary).toHaveClass('btn-secondary');

    fireEvent.click(cta);
    expect(setStep).toHaveBeenCalledWith('consent');

    expect(
      screen.getByText(/cómo funciona \(sin muro de pago\)/i),
    ).toBeVisible();

    const plansBody = container.querySelector('.welcome-plans-body');
    expect(plansBody).toBeTruthy();
    const plansText = plansBody!.textContent ?? '';
    expect(plansText).toMatch(/gratis sin cuenta/i);
    expect(plansText).toMatch(/como\s+invitado/i);
    expect(plansText).toMatch(/sin tarjeta/i);
    expect(plansText).toMatch(/suscripción obligatoria/i);
    expect(plansText).toMatch(/cuenta es opcional/i);
    expect(plansText).toMatch(/progreso seguro/i);
    expect(plansText).toMatch(/este dispositivo/i);
    expect(plansText).toMatch(/apoyo opcional/i);
    expect(plansText).not.toMatch(/\$\s*\d|ARS|\d+\s*\/\s*mes|\d+\s*pesos/i);
    expect(within(plansBody as HTMLElement).queryByText(/\$/)).toBeNull();
  });

  it('muestra Colecciones y aplica todos los campos al elegir una', () => {
    const setStep = vi.fn();
    const updateCheckIn = vi.fn();
    render(
      <WelcomeStep sessionApi={mockSessionApi({ setStep, updateCheckIn })} />,
    );

    expect(
      screen.getByRole('heading', { name: /^colecciones$/i }),
    ).toBeVisible();

    const first = COLLECTIONS[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(first.title, 'i') }));
    expect(updateCheckIn).toHaveBeenCalledWith({
      duration: first.duration,
      style: first.style,
      experience: first.experience,
      intention: first.intention,
      moment: first.moment,
    });
    expect(setStep).toHaveBeenCalledWith('consent');
  });

  it('la pausa rápida de 1 min aplica la colección completa', () => {
    const setStep = vi.fn();
    const updateCheckIn = vi.fn();
    render(
      <WelcomeStep sessionApi={mockSessionApi({ setStep, updateCheckIn })} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /^pausa rápida · 1 min$/i }),
    );
    expect(updateCheckIn).toHaveBeenCalledWith({
      duration: RAPIDA_1_MIN.duration,
      style: RAPIDA_1_MIN.style,
      experience: RAPIDA_1_MIN.experience,
      intention: RAPIDA_1_MIN.intention,
      moment: RAPIDA_1_MIN.moment,
    });
    expect(setStep).toHaveBeenCalledWith('consent');
  });
});

describe('WelcomeStep hábito invitado', () => {
  beforeEach(() => {
    clearGuestProgress();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    clearGuestProgress();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no muestra la señal de hábito sin progreso o con count 0', () => {
    const first = render(<WelcomeStep sessionApi={mockSessionApi()} />);
    expect(first.container.querySelector('.welcome-habit')).toBeNull();
    expect(
      screen.queryByText(/llevás \d+ pausas? en este dispositivo/i),
    ).toBeNull();
    first.unmount();

    saveGuestProgress({
      duration: 5,
      voiceVariant: 'es-neutro',
      intention: '',
      style: '',
      moment: '',
      experience: '',
      step: 'welcome',
      meditationCompleted: false,
      meditationCount: 0,
    });
    const { container } = render(<WelcomeStep sessionApi={mockSessionApi()} />);
    expect(container.querySelector('.welcome-habit')).toBeNull();
    expect(
      screen.queryByText(/llevás \d+ pausas? en este dispositivo/i),
    ).toBeNull();
  });

  it('muestra singular con 1 pausa en este dispositivo', () => {
    saveGuestProgress({
      duration: 5,
      voiceVariant: 'es-AR',
      intention: '',
      style: '',
      moment: '',
      experience: '',
      step: 'welcome',
      meditationCompleted: true,
      meditationCount: 1,
    });
    const { container } = render(<WelcomeStep sessionApi={mockSessionApi()} />);
    const habit = container.querySelector('.welcome-habit');
    expect(habit).toBeTruthy();
    expect(habit).toBeVisible();
    expect(habit).toHaveAttribute('role', 'status');
    expect(habit).toHaveTextContent('Llevás 1 pausa en este dispositivo.');
  });

  it('muestra plural con N pausas en este dispositivo', () => {
    saveGuestProgress({
      duration: 3,
      voiceVariant: 'es-neutro',
      intention: '',
      style: '',
      moment: '',
      experience: '',
      step: 'feedback',
      meditationCompleted: true,
      meditationCount: 3,
    });
    const { container } = render(<WelcomeStep sessionApi={mockSessionApi()} />);
    const habit = container.querySelector('.welcome-habit');
    expect(habit).toBeTruthy();
    expect(habit).toBeVisible();
    expect(habit).toHaveAttribute('role', 'status');
    expect(habit).toHaveTextContent('Llevás 3 pausas en este dispositivo.');
  });
});
