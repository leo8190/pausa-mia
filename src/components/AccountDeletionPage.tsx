import { useState, type FormEvent } from 'react';
import { useAccount } from '../hooks/useAccount';

const ACCOUNT_SERVICE = 'https://pausa-mia-api.fly.dev';

/** Dedicated web path: no install, account creation, analytics or voice requests. */
export function AccountDeletionPage() {
  const account = useAccount(ACCOUNT_SERVICE, true);
  const [userId, setUserId] = useState('');
  const [loginSecret, setLoginSecret] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setConfirmed(false);
    try {
      await account.login(userId.trim(), loginSecret);
    } finally {
      setLoginSecret('');
      setBusy(false);
    }
  }

  async function removeAccount() {
    if (busy || !confirmed || !account.user) return;
    setBusy(true);
    try {
      if (await account.deleteAccount()) {
        setDeleted(true);
        setUserId('');
        setConfirmed(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchAccount() {
    if (busy) return;
    setBusy(true);
    setConfirmed(false);
    try {
      await account.logout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="deletion-page">
      <p className="deletion-brand">Pausa Mía</p>
      <h1>Eliminar mi cuenta</h1>
      <p>Podés eliminar tu cuenta desde esta página, sin instalar la app.</p>
      <section aria-labelledby="deletion-scope">
        <h2 id="deletion-scope">Qué se elimina</h2>
        <p>
          La cuenta y el contexto asociado que guardaste en Pausa Mía. Esta acción no se
          puede deshacer.
        </p>
        <p>
          Los datos guardados en tus dispositivos se borran por separado. Las copias de
          seguridad y los datos enviados a otros servicios se rigen por la política de
          privacidad; esta acción no confirma su eliminación inmediata.
        </p>
        <a
          href="https://leo8190.github.io/pausa-mia/privacidad/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Política de privacidad
        </a>
      </section>
      {account.error && <p role="alert">{account.error}</p>}
      {deleted ? (
        <section role="status">
          <h2>Tu cuenta se eliminó de Pausa Mía</h2>
          <p>Recordá borrar por separado los datos locales de tus dispositivos.</p>
          {account.deletionWarning && (
            <p role="alert">
              No pudimos confirmar la retirada de permisos en Google.{' '}
              <a
                href="https://myaccount.google.com/connections"
                target="_blank"
                rel="noopener noreferrer"
              >
                Revisar permisos en Google
              </a>
              .
            </p>
          )}
        </section>
      ) : account.phase === 'loading' ? (
        <p role="status">Comprobando tu sesión…</p>
      ) : account.user ? (
        <section>
          <h2>Confirmá la cuenta</h2>
          <p>
            Identificador: <strong>{account.user.id}</strong>
          </p>
          {!account.deletionIdentityGuardAvailable && (
            <p role="alert">
              El servicio de borrado web todavía no está habilitado. No se eliminó tu
              cuenta.
            </p>
          )}
          <label className="deletion-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Confirmo que quiero eliminar esta cuenta y sus datos asociados.
          </label>
          <button
            type="button"
            disabled={!confirmed || busy || !account.deletionIdentityGuardAvailable}
            onClick={() => void removeAccount()}
          >
            {busy ? 'Esperá…' : 'Eliminar mi cuenta y datos'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSwitchAccount()}
          >
            Usar otra cuenta
          </button>
        </section>
      ) : account.phase === 'unavailable' ? (
        <p role="alert">
          No pudimos conectar con el servicio. No se eliminó ninguna cuenta. Volvé a
          abrir esta página más tarde.
        </p>
      ) : (
        <form onSubmit={(event) => void login(event)}>
          <h2>Ingresá a tu cuenta</h2>
          <p>
            Usá el identificador y la clave de Pausa Mía para confirmar que la cuenta es
            tuya.
          </p>
          <label>
            Identificador de cuenta
            <input
              name="userId"
              autoComplete="username"
              value={userId}
              required
              disabled={busy}
              onChange={(event) => setUserId(event.target.value)}
            />
          </label>
          <label>
            Clave de acceso
            <input
              name="loginSecret"
              type="password"
              autoComplete="current-password"
              value={loginSecret}
              required
              disabled={busy}
              onChange={(event) => setLoginSecret(event.target.value)}
            />
          </label>
          <button disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar para eliminar mi cuenta'}
          </button>
        </form>
      )}
    </main>
  );
}
