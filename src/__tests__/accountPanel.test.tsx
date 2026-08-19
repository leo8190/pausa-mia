import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPanel } from '../components/AccountPanel';

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe('AccountPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mantiene el modo invitado como opción principal y oculta el formulario', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ authenticated: false, mode: 'guest' })),
    );

    render(<AccountPanel locale="es-AR" />);
    const details = screen.getByText(/crear cuenta opcional/i).closest('details');

    expect(details).not.toHaveAttribute('open');
    await waitFor(() =>
      expect(
        screen.getByText(/también podés continuar como invitado/i),
      ).toBeInTheDocument(),
    );
  });

  it('crea una cuenta sin guardar la clave en el cliente', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/account/status')) {
        return jsonResponse({ authenticated: false, mode: 'guest' });
      }
      expect(url).toContain('/api/account/register');
      expect(init?.body).toContain('displayName');
      expect(init?.body).toContain('secreta-123');
      return jsonResponse({
        user: {
          id: 'usr-demo',
          displayName: 'Mi pausa',
          locale: 'es-AR',
          status: 'active',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AccountPanel locale="es-AR" />);
    fireEvent.click(screen.getByText(/crear cuenta opcional/i));
    fireEvent.change(screen.getByLabelText(/apodo/i), {
      target: { value: 'Mi pausa' },
    });
    fireEvent.change(screen.getByLabelText(/clave de acceso/i), {
      target: { value: 'secreta-123' },
    });
    const form = screen.getByLabelText(/clave de acceso/i).closest('form');
    expect(form).toBeTruthy();
    fireEvent.click(
      within(form as HTMLFormElement).getByRole('button', { name: /^crear cuenta$/i }),
    );

    await waitFor(() => expect(screen.getByText(/usr-demo/i)).toBeInTheDocument());
    expect(screen.queryByDisplayValue('secreta-123')).not.toBeInTheDocument();
  });
});
