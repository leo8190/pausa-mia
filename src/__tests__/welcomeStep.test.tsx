import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { WelcomeStep } from '../components/WelcomeStep';
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
    expect(plansText).toMatch(/apoyo opcional/i);
    expect(plansText).not.toMatch(/\$\s*\d|ARS|\d+\s*\/\s*mes|\d+\s*pesos/i);
    expect(within(plansBody as HTMLElement).queryByText(/\$/)).toBeNull();
  });
});
