import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextStep } from '../components/ContextStep';
import type { SessionApi } from '../hooks/useSession';
import { createManualDiarySources } from '../lib/contextSources';
import type { SessionState } from '../types';

function makeSessionApi(): SessionApi {
  const contextSources = createManualDiarySources();
  return {
    session: {
      contextSources,
    } as unknown as SessionState,
    setStep: vi.fn(),
    deleteSession: vi.fn(),
    updateContextSources: vi.fn(),
  } as unknown as SessionApi;
}

describe('ContextStep', () => {
  it('keeps the diary visible and collapses JSON/CSV/social extras', () => {
    render(<ContextStep sessionApi={makeSessionApi()} />);

    expect(
      screen.getByLabelText(/contenido de diario manual — hoy/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /agregar otra fuente manual/i }),
    ).toBeInTheDocument();

    const details = screen.getByText(/agregar contexto opcional/i).closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByLabelText(/fuentes que podés agregar/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/importar archivo local \(texto o json\)/i),
    ).toBeInTheDocument();
  });

  it('still exposes import and future sources after opening the optional block', () => {
    render(<ContextStep sessionApi={makeSessionApi()} />);
    const details = screen.getByText(/agregar contexto opcional/i).closest('details');
    expect(details).toBeTruthy();
    fireEvent.click(screen.getByText(/agregar contexto opcional/i));
    expect(details).toHaveAttribute('open');
    expect(
      screen.getByRole('button', {
        name: /conectar google calendar.*desactivada/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText(/importar uno o más archivos locales para calendario/i),
    ).toBeInTheDocument();
  });
});
