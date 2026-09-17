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
  it('keeps the diary visible and extra notes/files optional without inactive connections', () => {
    render(<ContextStep sessionApi={makeSessionApi()} />);

    expect(screen.getByLabelText(/tu nota de hoy/i)).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /usar la nota de hoy/i }),
    ).not.toBeChecked();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).not.toBeInTheDocument();
    const details = screen.getByText(/agregar otra nota o archivo/i).closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
    expect(
      screen.queryByLabelText(/fuentes que podés agregar/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/caracteres|no se simulan|OAuth|desactivada/i),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/elegir un archivo/i)).toBeInTheDocument();
  });

  it('can add a note or choose files after opening the optional block', () => {
    const sessionApi = makeSessionApi();
    render(<ContextStep sessionApi={sessionApi} />);
    const details = screen.getByText(/agregar otra nota o archivo/i).closest('details');
    expect(details).toBeTruthy();
    fireEvent.click(screen.getByText(/agregar otra nota o archivo/i));
    expect(details).toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: /^agregar otra nota$/i }));
    expect(sessionApi.updateContextSources).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Otra nota', content: '' }),
      ]),
    );
    expect(screen.getByLabelText(/elegir un archivo/i)).toHaveAttribute('type', 'file');
  });
});
