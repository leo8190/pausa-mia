import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StepLayout } from '../components/StepLayout';

describe('inicio de cada pantalla', () => {
  it('focuses its heading and scrolls to the start on a new step', () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    const { rerender } = render(
      <StepLayout title="Primer paso">
        <input aria-label="Respuesta" />
      </StepLayout>,
    );
    expect(screen.getByRole('heading', { name: 'Primer paso' })).toHaveFocus();
    scroll.mockClear();
    screen.getByRole('textbox').focus();
    rerender(
      <StepLayout title="Siguiente paso">
        <input aria-label="Respuesta" />
      </StepLayout>,
    );
    expect(screen.getByRole('heading', { name: 'Siguiente paso' })).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });
  it('does not move focus or scroll while editing the same screen', () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    const { rerender } = render(
      <StepLayout title="Tu pausa">
        <input aria-label="Respuesta" />
      </StepLayout>,
    );
    const input = screen.getByRole('textbox');
    input.focus();
    scroll.mockClear();
    fireEvent.change(input, { target: { value: 'Prueba' } });
    rerender(
      <StepLayout title="Tu pausa" lead="Descripción nueva">
        <input aria-label="Respuesta" />
      </StepLayout>,
    );
    expect(input).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
  });
});
