import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { WelcomeStep } from '../components/WelcomeStep';
import { COLLECTIONS, RAPIDA_1_MIN } from '../lib/collections';
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('muestra Empezar gratis · sin tarjeta y el bloque de planes sin precios inventados', () => {
    const setStep = vi.fn();
    const { container } = render(
      <WelcomeStep sessionApi={mockSessionApi({ setStep })} />,
    );

    const cta = screen.getByRole('button', {
      name: /^empezar gratis · sin tarjeta$/i,
    });
    expect(cta).toBeVisible();
    expect(cta).toHaveClass('btn-primary');

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
    expect(plansText).toMatch(/meditar como invitado/i);
    expect(plansText).toMatch(/sin tarjeta/i);
    expect(plansText).toMatch(/sin suscripción obligatoria/i);
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
