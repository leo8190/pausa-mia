import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionPage } from '../components/AccountDeletionPage';

const user = {
  id: 'synthetic-account-A',
  displayName: null,
  createdAt: '',
  locale: 'es-AR',
  status: 'active',
};
const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });
const account = { user, accountDeletionGuard: 'expected-user-id' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('external account deletion', () => {
  it('requires confirmation and sends the displayed identity only to the account service', async () => {
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      expect(url.startsWith('https://pausa-mia-api.fly.dev/api/account')).toBe(true);
      expect(init?.credentials).toBe('include');
      if (url.endsWith('/status')) return response(account);
      expect(init?.method).toBe('DELETE');
      expect(JSON.parse(String(init?.body))).toEqual({ expectedUserId: user.id });
      return response({ ok: true, googleRevocation: 'not_linked' });
    });
    vi.stubGlobal('fetch', fetch);
    render(<AccountDeletionPage />);
    const remove = await screen.findByRole('button', {
      name: 'Eliminar mi cuenta y datos',
    });
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(remove);
    expect(
      await screen.findByText('Tu cuenta se eliminó de Pausa Mía'),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(user.id)).not.toBeInTheDocument();
  });

  it.each(['unconfirmed', undefined])(
    'does not claim Google revocation when it is %s',
    async (googleRevocation) => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          url.endsWith('/status')
            ? response(account)
            : response({ ok: true, googleRevocation }),
        ),
      );
      render(<AccountDeletionPage />);
      await screen.findByText(user.id);
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(
        screen.getByRole('button', { name: 'Eliminar mi cuenta y datos' }),
      );
      expect(
        await screen.findByRole('link', { name: 'Revisar permisos en Google' }),
      ).toBeInTheDocument();
    },
  );

  it('keeps the displayed account when the session changed instead of announcing deletion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.endsWith('/status')
          ? response(account)
          : response({ error: 'ACCOUNT_CHANGED' }, false),
      ),
    );
    render(<AccountDeletionPage />);
    await screen.findByText(user.id);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta y datos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La sesión cambió de cuenta',
    );
    expect(screen.getByText(user.id)).toBeInTheDocument();
    expect(
      screen.queryByText('Tu cuenta se eliminó de Pausa Mía'),
    ).not.toBeInTheDocument();
  });

  it('does not delete against an old service without an identity guard', async () => {
    const fetch = vi.fn(() => response({ user }));
    vi.stubGlobal('fetch', fetch);
    render(<AccountDeletionPage />);
    await screen.findByText(user.id);
    fireEvent.click(screen.getByRole('checkbox'));
    const remove = screen.getByRole('button', { name: 'Eliminar mi cuenta y datos' });
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('blocks confirmation and deletion while a change of account is pending, then keeps the account on failure', async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn((url: string) =>
      url.endsWith('/status')
        ? response(account)
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    vi.stubGlobal('fetch', fetch);
    render(<AccountDeletionPage />);
    await screen.findByText(user.id);
    fireEvent.click(screen.getByRole('button', { name: 'Usar otra cuenta' }));
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Esperá…' })).toBeDisabled();
    finish({ ok: false, json: () => Promise.resolve({ error: 'INTERNAL_ERROR' }) });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos completar'),
    );
    expect(screen.getByText(user.id)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('clears the password after failed login and never registers an account', async () => {
    const fetch = vi.fn((url: string) =>
      url.endsWith('/status')
        ? response({ user: null })
        : response({ error: 'LOGIN_INVALID' }, false),
    );
    vi.stubGlobal('fetch', fetch);
    render(<AccountDeletionPage />);
    const id = await screen.findByLabelText('Identificador de cuenta');
    fireEvent.change(id, { target: { value: 'synthetic-id' } });
    fireEvent.change(screen.getByLabelText('Clave de acceso'), {
      target: { value: 'synthetic-login-test' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Ingresar para eliminar mi cuenta' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('no coinciden');
    expect(screen.getByLabelText('Clave de acceso')).toHaveValue('');
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/register'))).toBe(false);
  });
});
