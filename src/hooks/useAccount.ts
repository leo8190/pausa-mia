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
};

const GENERIC_ERROR = 'No pudimos completar la acción. Probá de nuevo.';

async function requestAccount(path: string, init: RequestInit = {}) {
  const response = await fetch(buildAccountApiUrl(path), {
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
  }
  return GENERIC_ERROR;
}

export function useAccount() {
  const [state, setState] = useState<AccountState>({
    phase: 'loading',
    user: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const body = await requestAccount('/api/account/status', { method: 'GET' });
      setState({
        phase: body.user ? 'account' : 'guest',
        user: body.user ?? null,
        error: null,
      });
    } catch {
      // El prototipo sigue funcionando como invitado si todavía no hay backend público.
      setState({ phase: 'unavailable', user: null, error: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(
    async (displayName: string, loginSecret: string, locale: string) => {
      try {
        const body = await requestAccount('/api/account/register', {
          method: 'POST',
          body: JSON.stringify({ displayName, loginSecret, locale }),
        });
        setState({ phase: 'account', user: body.user ?? null, error: null });
        return true;
      } catch (error) {
        setState((current) => ({ ...current, error: friendlyError(error) }));
        return false;
      }
    },
    [],
  );

  const login = useCallback(async (userId: string, loginSecret: string) => {
    try {
      const body = await requestAccount('/api/account/login', {
        method: 'POST',
        body: JSON.stringify({ userId, loginSecret }),
      });
      setState({ phase: 'account', user: body.user ?? null, error: null });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: friendlyError(error) }));
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestAccount('/api/account/logout', { method: 'POST' });
    } finally {
      setState({ phase: 'guest', user: null, error: null });
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      await requestAccount('/api/account', { method: 'DELETE' });
      setState({ phase: 'guest', user: null, error: null });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: friendlyError(error) }));
      return false;
    }
  }, []);

  return {
    ...state,
    backendAvailable: state.phase !== 'unavailable',
    register,
    login,
    logout,
    deleteAccount,
  };
}
