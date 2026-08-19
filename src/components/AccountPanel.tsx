import { useState, type FormEvent } from 'react';
import { useAccount } from '../hooks/useAccount';

export function AccountPanel({ locale }: { locale: string }) {
  const account = useAccount();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [loginSecret, setLoginSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const ok =
      mode === 'register'
        ? await account.register(displayName.trim(), loginSecret, locale)
        : await account.login(userId.trim(), loginSecret);
    setBusy(false);
    if (ok) {
      setLoginSecret('');
      setMessage(
        mode === 'register'
          ? 'Cuenta creada. Guardá tu identificador para volver a entrar.'
          : 'Sesión iniciada.',
      );
    }
  }

  async function handleDelete() {
    if (!window.confirm('¿Querés eliminar tu cuenta y todo el contexto guardado?'))
      return;
    setBusy(true);
    await account.deleteAccount();
    setBusy(false);
  }

  return (
    <details className="account-panel">
      <summary>
        <span>
          <strong>{account.user ? 'Tu cuenta' : 'Crear cuenta opcional'}</strong>
          <small>
            {account.user
              ? 'Gestioná tu sesión y tus datos'
              : 'También podés continuar como invitado'}
          </small>
        </span>
        <span className="account-panel-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>

      <div className="account-panel-content">
        {account.user ? (
          <div className="account-user-state">
            <p className="account-user-line">
              {account.user.displayName
                ? `Hola, ${account.user.displayName}.`
                : 'Tu cuenta está activa.'}
            </p>
            <p className="account-hint">
              Tu identificador es <strong>{account.user.id}</strong>. Lo vas a necesitar
              para volver a iniciar sesión.
            </p>
            <div className="account-actions">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => void account.logout()}
                disabled={busy}
              >
                Cerrar sesión
              </button>
              <button
                type="button"
                className="btn btn-danger btn-small"
                onClick={() => void handleDelete()}
                disabled={busy}
              >
                Eliminar cuenta
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="account-hint">
              Una cuenta permite conservar preferencias y, más adelante, conectar
              fuentes con tu permiso. Nunca es necesaria para probar la meditación.
            </p>
            {!account.backendAvailable && (
              <p className="account-unavailable" role="status">
                Las cuentas todavía no están habilitadas en esta dirección. Podés
                continuar como invitado.
              </p>
            )}
            <div
              className="account-mode-toggle"
              role="tablist"
              aria-label="Acceso a la cuenta"
            >
              <button
                type="button"
                className={mode === 'register' ? 'is-active' : ''}
                onClick={() => {
                  setMode('register');
                  setMessage(null);
                }}
              >
                Crear cuenta
              </button>
              <button
                type="button"
                className={mode === 'login' ? 'is-active' : ''}
                onClick={() => {
                  setMode('login');
                  setMessage(null);
                }}
              >
                Ya tengo una
              </button>
            </div>
            <form
              className="account-form"
              onSubmit={(event) => void handleSubmit(event)}
            >
              {mode === 'register' ? (
                <label>
                  Apodo <span>(opcional)</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={80}
                    autoComplete="nickname"
                    disabled={!account.backendAvailable || busy}
                  />
                </label>
              ) : (
                <label>
                  Identificador de cuenta
                  <input
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    required
                    autoComplete="username"
                    disabled={!account.backendAvailable || busy}
                  />
                </label>
              )}
              <label>
                Clave de acceso
                <input
                  type="password"
                  value={loginSecret}
                  onChange={(event) => setLoginSecret(event.target.value)}
                  minLength={8}
                  required
                  autoComplete={
                    mode === 'register' ? 'new-password' : 'current-password'
                  }
                  disabled={!account.backendAvailable || busy}
                />
              </label>
              <button
                type="submit"
                className="btn btn-secondary btn-small"
                disabled={!account.backendAvailable || busy}
              >
                {busy
                  ? 'Procesando…'
                  : mode === 'register'
                    ? 'Crear cuenta'
                    : 'Iniciar sesión'}
              </button>
            </form>
            {account.error && (
              <p className="account-error" role="alert">
                {account.error}
              </p>
            )}
            {message && (
              <p className="account-success" role="status">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
