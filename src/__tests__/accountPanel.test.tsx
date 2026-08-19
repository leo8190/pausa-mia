import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPanel } from '../components/AccountPanel';

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe('AccountPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('muestra estado de conectores para cuenta autenticada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/account/status')) {
          return jsonResponse({
            authenticated: true,
            mode: 'account',
            user: {
              id: 'usr-a',
              displayName: 'Leonardo',
              locale: 'es-AR',
              status: 'active',
            },
          });
        }
        if (url.endsWith('/api/connectors/providers')) {
          return jsonResponse({
            providers: [
              {
                provider: 'google_calendar',
                state: 'disconnected',
                configured: true,
              },
              {
                provider: 'google_drive',
                state: 'connected',
                configured: true,
              },
            ],
          });
        }
        return jsonResponse({});
      }),
    );

    render(<AccountPanel locale="es-AR" />);
    await waitFor(() =>
      expect(screen.getByText(/hola, leonardo/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/conectar google \(opcional\)/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/google calendar/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/google drive/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/^desconectada$/i)).toBeInTheDocument();
    expect(screen.getByText(/^conectada$/i)).toBeInTheDocument();
  });

  it('registra consentimiento, llama oauth start y abre authorizationUrl', async () => {
    const openMock = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/account/status')) {
        return jsonResponse({
          authenticated: true,
          mode: 'account',
          user: {
            id: 'usr-b',
            displayName: 'Pausa',
            locale: 'es-AR',
            status: 'active',
          },
        });
      }
      if (url.endsWith('/api/connectors/providers')) {
        return jsonResponse({
          providers: [
            {
              provider: 'google_calendar',
              state: 'disconnected',
              configured: true,
            },
            {
              provider: 'google_drive',
              state: 'disconnected',
              configured: true,
            },
          ],
        });
      }
      if (url.endsWith('/api/connectors/google_calendar/consents')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body.purpose).toMatch(/eventos próximos/i);
        expect(body.scopes).toContain(
          'https://www.googleapis.com/auth/calendar.readonly',
        );
        return jsonResponse({ provider: 'google_calendar', consent: { id: 'cons-1' } });
      }
      if (url.endsWith('/api/connectors/google_calendar/oauth/start')) {
        expect(init?.method).toBe('POST');
        return jsonResponse({
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=test-1',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AccountPanel locale="es-AR" />);
    await waitFor(() =>
      expect(screen.getByText(/conectar google \(opcional\)/i)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /conectar google calendar/i }),
      ).toBeInTheDocument(),
    );

    const consentToggles = screen.getAllByRole('checkbox');
    fireEvent.click(consentToggles[0]);
    fireEvent.click(screen.getByRole('button', { name: /conectar google calendar/i }));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        expect.stringContaining('accounts.google.com'),
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(
      screen.getByText(/abrimos google calendar en una pestaña nueva/i),
    ).toBeInTheDocument();
  });

  it('permite desconectar un conector conectado', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let providerReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/account/status')) {
        return jsonResponse({
          authenticated: true,
          mode: 'account',
          user: {
            id: 'usr-c',
            displayName: 'Pausa',
            locale: 'es-AR',
            status: 'active',
          },
        });
      }
      if (url.endsWith('/api/connectors/providers')) {
        providerReads += 1;
        return jsonResponse({
          providers: [
            {
              provider: 'google_calendar',
              state: providerReads === 1 ? 'connected' : 'disconnected',
              configured: true,
            },
            { provider: 'google_drive', state: 'disconnected', configured: true },
          ],
        });
      }
      if (url.endsWith('/api/connectors/google_calendar/oauth/revoke')) {
        expect(init?.method).toBe('POST');
        return jsonResponse({
          ok: true,
          provider: 'google_calendar',
          state: 'revoked',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AccountPanel locale="es-AR" />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /desconectar google calendar/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole('button', { name: /desconectar google calendar/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/google calendar quedó desconectado/i),
      ).toBeInTheDocument(),
    );
    expect(window.confirm).toHaveBeenCalled();
  });
});
