import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SafetyStep } from '../components/SafetyStep';
import type { SessionApi } from '../hooks/useSession';
import { ARGENTINA_CRISIS_LINE } from '../lib/safetyDetector';

function renderSafety() {
  const sessionApi = {
    updateCheckIn: vi.fn(),
    setStep: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionApi;
  render(<SafetyStep sessionApi={sessionApi} />);
}

it('muestra la línea de ayuda como enlace telefónico tocable', () => {
  renderSafety();
  const phone = screen.getByRole('link', { name: ARGENTINA_CRISIS_LINE });
  expect(phone).toHaveAttribute('href', 'tel:08009990091');
});

it('avisa que la fuente oficial se abre en otra pestaña', () => {
  renderSafety();
  const source = screen.getByRole('link', { name: /Fuente oficial/ });
  expect(source).toHaveAccessibleName('Fuente oficial (se abre en otra pestaña)');
  expect(source).toHaveAttribute('target', '_blank');
});
