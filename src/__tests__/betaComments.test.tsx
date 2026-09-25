import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BetaComments } from '../components/BetaComments';

const EMAIL = 'leonardo23322@gmail.com';
const BODY =
  'Mi comentario sobre Pausa Mía:\n\n¿Pude abrir la página?\n¿Hasta dónde llegué: página, guion o audio?\n¿Qué mejoraría?\n\nNo incluyas datos personales, tu diario ni el guion generado.';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('voluntary beta comments', () => {
  it('uses the exact fixed recipient, subject and body without session data', () => {
    localStorage.setItem(
      'synthetic-session',
      JSON.stringify({
        diary: 'PRIVATE-DIARY-123',
        name: 'PRIVATE-NAME-123',
        script: 'PRIVATE-SCRIPT-123',
      }),
    );
    const { rerender } = render(<BetaComments />);
    const link = screen.getByRole('link', { name: 'Escribir comentario por correo' });
    const original = link.getAttribute('href');
    const url = new URL(original!);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe(EMAIL);
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body']);
    expect(url.searchParams.get('subject')).toBe('Pausa Mía — comentario de la beta');
    expect(url.searchParams.get('body')).toBe(BODY);
    expect(decodeURIComponent(original!)).not.toMatch(/PRIVATE-|visitor|token|rating/);
    localStorage.setItem('synthetic-session', 'CHANGED-PRIVATE-DATA');
    rerender(<BetaComments />);
    expect(link).toHaveAttribute('href', original);
    expect(
      screen.getByText(/el equipo verá tu dirección de remitente/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no incluyas tu diario, datos personales ni el guion generado/i),
    ).toBeInTheDocument();
  });

  it('never opens mail, copies or sends a request on render', () => {
    const writeText = vi.fn();
    const fetchMock = vi.fn();
    const open = vi.spyOn(window, 'open');
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('fetch', fetchMock);
    render(<BetaComments />);
    expect(writeText).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/enviado|recibido|gracias por enviar/i),
    ).not.toBeInTheDocument();
  });

  it('copies only the address after the user clicks and confirms after completion', async () => {
    let finish: () => void = () => {};
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<BetaComments />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Copiar dirección de contacto' }),
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(EMAIL);
    expect(screen.getByRole('button', { name: 'Copiando dirección…' })).toBeDisabled();
    expect(screen.getByRole('status')).not.toHaveTextContent('Dirección copiada.');
    finish();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Dirección copiada.'),
    );
    expect(
      screen.getByRole('button', { name: 'Copiar dirección de contacto' }),
    ).toBeEnabled();
    expect(screen.queryByText(/comentario enviado/i)).not.toBeInTheDocument();
  });

  it.each(['missing', 'rejected'])(
    'offers manual selection when clipboard is %s',
    async (state) => {
      vi.stubGlobal(
        'navigator',
        state === 'missing'
          ? {}
          : {
              clipboard: {
                writeText: vi.fn().mockRejectedValue(new Error('Not allowed')),
              },
            },
      );
      render(<BetaComments />);
      const address = screen.getByRole('textbox', { name: 'Dirección de contacto' });
      expect(address).toHaveValue(EMAIL);
      expect(address).toHaveAttribute('readonly');
      fireEvent.click(
        screen.getByRole('button', { name: 'Copiar dirección de contacto' }),
      );
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/copiala manualmente/i),
      );
      expect(address).toHaveFocus();
      expect(screen.getByRole('status')).not.toHaveTextContent('Dirección copiada.');
    },
  );
});
