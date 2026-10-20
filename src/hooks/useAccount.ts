import { useCallback, useEffect, useState } from 'react';
import { buildAccountApiUrl } from '../lib/accountApiUrl';

export type AccountUser = {
  id: string;
  createdAt: string;
  displayName: string | null;
  locale: string;
  status: string;
};

type AccountState = {
  phase: 'loading' | 'guest' | 'account' | 'unavailable';
  user: AccountUser | null;
  error: string | null;
  deletionWarning?: boolean;
  deletionIdentityGuardAvailable?: boolean;
};

const GENERIC_ERROR = 'No pudimos completar la acción. Probá de nuevo.';

async function requestAccount(
  path: string,
  init: RequestInit = {},
  apiBaseUrl?: string,
) {
  const url =
    apiBaseUrl === undefined
      ? buildAccountApiUrl(path)
      : buildAccountApiUrl(path, { VITE_ACCOUNT_API_URL: apiBaseUrl });
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    user?: AccountUser;
    googleRevocation?: 'revoked' | 'not_linked' | 'unconfirmed';
    accountDeletionGuard?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? GENERIC_ERROR);
  }
  return body;
}

function friendlyError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === 'LOGIN_INVALID')
      return 'El identificador o la clave no coinciden.';
    if (error.message === 'LOGIN_SECRET_INVALID')
      return 'La clave debe tener al menos 8 caracteres.';
    if (error.message === 'ORIGIN_NOT_ALLOWED')
      return 'Esta dirección todavía no está habilitada para cuentas.';
    if (error.message === 'ACCOUNT_CHANGED')
      return 'La sesión cambió de cuenta. Volvé a ingresar antes de eliminarla.';
  }
  return GENERIC_ERROR;
}

export function useAccount(apiBaseUrl?: string, requireDeletionIdentityGuard = false) {
  const [state, setState] = useState<AccountState>({
    phase: 'loading',
    user: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const body = await requestAccount(
        '/api/account/status',
        { method: 'GET' },
        apiBaseUrl,
      );
      setState({
        phase: body.user ? 'account' : 'guest',
        user: body.user ?? null,
        error: null,
        deletionIdentityGuardAvailable:
          body.accountDeletionGuard === 'expected-user-id',
      });
    } catch {
      // El prototipo sigue funcionando como invitado si todavía no hay backend público.
      setState({ phase: 'unavailable', user: null, error: null });
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(
    async (displayName: string, loginSecret: string, locale: string) => {
      try {
        const body = await requestAccount(
          '/api/account/register',
          {
            method: 'POST',
            body: JSON.stringify({ displayName, loginSecret, locale }),
          },
          apiBaseUrl,
        );
        setState({
          phase: 'account',
          user: body.user ?? null,
          error: null,
          deletionIdentityGuardAvailable:
            body.accountDeletionGuard === 'expected-user-id',
        });
        return true;
      } catch (error) {
        setState((current) => ({ ...current, error: friendlyError(error) }));
        return false;
      }
    },
    [apiBaseUrl],
  );

  const login = useCallback(
    async (userId: string, loginSecret: string) => {
      try {
        const body = await requestAccount(
          '/api/account/login',
          {
            method: 'POST',
            body: JSON.stringify({ userId, loginSecret }),
          },
          apiBaseUrl,
        );
        setState({
          phase: 'account',
          user: body.user ?? null,
          error: null,
          deletionIdentityGuardAvailable:
            body.accountDeletionGuard === 'expected-user-id',
        });
        return true;
      } catch (error) {
        setState((current) => ({ ...current, error: friendlyError(error) }));
        return false;
      }
    },
    [apiBaseUrl],
  );

  const logout = useCallback(async () => {
    try {
      await requestAccount('/api/account/logout', { method: 'POST' }, apiBaseUrl);
      setState({ phase: 'guest', user: null, error: null });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: friendlyError(error) }));
      return false;
    }
  }, [apiBaseUrl]);

  const deleteAccount = useCallback(async () => {
    if (!state.user) return false;
    if (requireDeletionIdentityGuard && !state.deletionIdentityGuardAvailable) {
      setState((current) => ({
        ...current,
        error:
          'El servicio de borrado web todavía no está habilitado. No se eliminó tu cuenta.',
      }));
      return false;
    }
    try {
      const body = await requestAccount(
        '/api/account',
        { method: 'DELETE', body: JSON.stringify({ expectedUserId: state.user.id }) },
        apiBaseUrl,
      );
      setState({
        phase: 'guest',
        user: null,
        error: null,
        // An older server's empty response does not prove Google revocation.
        deletionWarning:
          body.googleRevocation !== 'revoked' && body.googleRevocation !== 'not_linked',
      });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: friendlyError(error) }));
      return false;
    }
  }, [
    apiBaseUrl,
    state.user,
    state.deletionIdentityGuardAvailable,
    requireDeletionIdentityGuard,
  ]);

  return {
    ...state,
    backendAvailable: state.phase !== 'unavailable',
    register,
    login,
    logout,
    deleteAccount,
  };
}
