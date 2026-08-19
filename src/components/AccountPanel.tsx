import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAccount } from '../hooks/useAccount';
import { buildAccountApiUrl } from '../lib/accountApiUrl';

type SupportedProvider = 'google_calendar' | 'google_drive';
type ProviderState = 'connected' | 'disconnected' | 'revoked' | 'error';

type ProviderStatus = {
  provider: SupportedProvider;
  state: ProviderState;
  configured: boolean;
};

type ConsentProfile = {
  title: string;
  purpose: string;
  evidence: string;
  scopes: string[];
};

const PROVIDER_COPY: Record<SupportedProvider, ConsentProfile> = {
  google_calendar: {
    title: 'Google Calendar',
    purpose:
      'Leer eventos próximos para sugerir horarios de práctica sin enviar tu diario, perfil ni guion.',
    evidence:
      'Consentimiento explícito desde panel de cuenta para conectar Google Calendar.',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ],
  },
  google_drive: {
    title: 'Google Drive',
    purpose:
      'Leer archivos que elijas para enriquecer contexto opcional sin enviar tu diario, perfil ni guion.',
    evidence:
      'Consentimiento explícito desde panel de cuenta para conectar Google Drive.',
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  },
};

function toFriendlyProviderState(status: ProviderStatus): string {
  if (!status.configured) return 'No configurado';
  if (status.state === 'connected') return 'Conectada';
  return 'Desconectada';
}

async function requestConnector(path: string, init: RequestInit = {}) {
  const response = await fetch(buildAccountApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    details?: {
      provider?: string;
      missingEnv?: string[];
      hint?: string;
    };
    providers?: ProviderStatus[];
    authorizationUrl?: string;
  };

  if (!response.ok) {
    const err = new Error(payload.error ?? 'CONNECTOR_REQUEST_FAILED');
    (err as Error & { details?: typeof payload.details }).details = payload.details;
    throw err;
  }

  return payload;
}

export function AccountPanel({ locale }: { locale: string }) {
  const account = useAccount();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [loginSecret, setLoginSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [consentChecks, setConsentChecks] = useState<
    Record<SupportedProvider, boolean>
  >({
    google_calendar: false,
    google_drive: false,
  });
  const [connectorBusy, setConnectorBusy] = useState<SupportedProvider | null>(null);
  const [connectorMessage, setConnectorMessage] = useState<string | null>(null);
  const [connectorError, setConnectorError] = useState<string | null>(null);

  const visibleProviders = useMemo(
    () =>
      providerStatuses.filter(
        (entry): entry is ProviderStatus =>
          entry.provider === 'google_calendar' || entry.provider === 'google_drive',
      ),
    [providerStatuses],
  );

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

  useEffect(() => {
    if (!account.user || !account.backendAvailable) {
      setProviderStatuses([]);
      return;
    }

    let cancelled = false;
    void requestConnector('/api/connectors/providers', { method: 'GET' })
      .then((body) => {
        if (cancelled) return;
        setProviderStatuses(Array.isArray(body.providers) ? body.providers : []);
      })
      .catch(() => {
        if (!cancelled) {
          setConnectorError(
            'No pudimos cargar el estado de conectores. Podés seguir como invitado sin conectar nada.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [account.user, account.backendAvailable]);

  async function refreshProviders() {
    if (!account.user) return;
    const body = await requestConnector('/api/connectors/providers', { method: 'GET' });
    setProviderStatuses(Array.isArray(body.providers) ? body.providers : []);
  }

  async function handleConnect(provider: SupportedProvider) {
    const consent = PROVIDER_COPY[provider];
    const providerName = consent.title;
    if (!consentChecks[provider]) {
      setConnectorError(`Marcá el consentimiento para conectar ${providerName}.`);
      return;
    }

    setConnectorBusy(provider);
    setConnectorError(null);
    setConnectorMessage(null);

    try {
      await requestConnector(`/api/connectors/${provider}/consents`, {
        method: 'POST',
        body: JSON.stringify({
          purpose: consent.purpose,
          evidence: consent.evidence,
          scopes: consent.scopes,
        }),
      });

      const started = await requestConnector(
        `/api/connectors/${provider}/oauth/start`,
        {
          method: 'POST',
        },
      );
      if (!started.authorizationUrl) {
        throw new Error('OAUTH_START_MISSING_URL');
      }

      const popup = window.open(
        started.authorizationUrl,
        '_blank',
        'noopener,noreferrer',
      );
      if (!popup) {
        setConnectorMessage(
          `No pudimos abrir una pestaña automática. Abrí este enlace para continuar con ${providerName}: ${started.authorizationUrl}`,
        );
      } else {
        setConnectorMessage(
          `Abrimos ${providerName} en una pestaña nueva para que completes autorización.`,
        );
      }

      await refreshProviders();
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : 'CONNECTOR_REQUEST_FAILED';
      if (code === 'UNAUTHORIZED') {
        setConnectorError('Tu sesión venció. Iniciá sesión de nuevo para conectar.');
      } else if (code === 'CONSENT_REQUIRED') {
        setConnectorError(
          'Hace falta un consentimiento activo con permisos antes de iniciar Google.',
        );
      } else if (code === 'CONNECTOR_NOT_CONFIGURED') {
        setConnectorError(
          `${providerName} no está configurado todavía en producción. Tu cuenta sigue funcionando sin conectarlo.`,
        );
      } else if (code === 'OAUTH_START_MISSING_URL') {
        setConnectorError(
          `No recibimos la URL de autorización de ${providerName}. Probá de nuevo.`,
        );
      } else {
        setConnectorError(
          `No pudimos iniciar la conexión con ${providerName}. Probá de nuevo.`,
        );
      }
    } finally {
      setConnectorBusy(null);
    }
  }

  async function handleRevoke(provider: SupportedProvider) {
    const providerName = PROVIDER_COPY[provider].title;
    if (
      !window.confirm(
        `¿Querés desconectar ${providerName}? Se revocará el acceso guardado y podrás volver a conectarlo cuando quieras.`,
      )
    ) {
      return;
    }

    setConnectorBusy(provider);
    setConnectorError(null);
    setConnectorMessage(null);

    try {
      await requestConnector(`/api/connectors/${provider}/oauth/revoke`, {
        method: 'POST',
      });
      setConsentChecks((prev) => ({ ...prev, [provider]: false }));
      await refreshProviders();
      setConnectorMessage(`${providerName} quedó desconectado.`);
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : 'CONNECTOR_REQUEST_FAILED';
      if (code === 'UNAUTHORIZED') {
        setConnectorError('Tu sesión venció. Iniciá sesión de nuevo para desconectar.');
      } else if (code === 'LINKED_ACCOUNT_NOT_FOUND') {
        setConnectorError(`${providerName} ya estaba desconectado.`);
        await refreshProviders();
      } else {
        setConnectorError(`No pudimos desconectar ${providerName}. Probá de nuevo.`);
      }
    } finally {
      setConnectorBusy(null);
    }
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
            <section
              className="account-connectors"
              aria-label="Conectar Google Calendar y Google Drive"
            >
              <h4>Conectar Google (opcional)</h4>
              <p className="account-hint">
                Modo invitado sigue disponible. Conectar es opcional y sólo ocurre
                después de mostrar propósito y permisos.
              </p>
              {visibleProviders.map((entry) => {
                const copy = PROVIDER_COPY[entry.provider];
                const statusLabel = toFriendlyProviderState(entry);
                const isBusy = connectorBusy === entry.provider;
                return (
                  <article className="account-connector-card" key={entry.provider}>
                    <div className="account-connector-head">
                      <strong>{copy.title}</strong>
                      <span
                        className={`account-connector-state${entry.configured ? '' : ' is-warning'}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <p className="account-hint">{copy.purpose}</p>
                    <p className="account-hint">
                      Permiso solicitado: solo lectura de{' '}
                      {entry.provider === 'google_calendar'
                        ? 'tu calendario'
                        : 'los archivos que elijas'}
                      .
                    </p>
                    <label
                      className="checkbox-option"
                      htmlFor={`consent-${entry.provider}`}
                    >
                      <input
                        id={`consent-${entry.provider}`}
                        type="checkbox"
                        checked={consentChecks[entry.provider]}
                        onChange={(event) =>
                          setConsentChecks((prev) => ({
                            ...prev,
                            [entry.provider]: event.target.checked,
                          }))
                        }
                        disabled={!entry.configured || isBusy}
                      />
                      <span>
                        Entiendo el propósito y autorizo iniciar Google para este
                        conector.
                      </span>
                    </label>
                    <div className="account-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={
                          !entry.configured || isBusy || entry.state === 'connected'
                        }
                        onClick={() => void handleConnect(entry.provider)}
                      >
                        {isBusy ? 'Conectando…' : `Conectar ${copy.title}`}
                      </button>
                      {entry.state === 'connected' && (
                        <button
                          type="button"
                          className="btn btn-danger btn-small"
                          disabled={isBusy}
                          onClick={() => void handleRevoke(entry.provider)}
                        >
                          {isBusy ? 'Desconectando…' : `Desconectar ${copy.title}`}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {connectorError && (
                <p className="account-error" role="alert">
                  {connectorError}
                </p>
              )}
              {connectorMessage && (
                <p className="account-success" role="status">
                  {connectorMessage}
                </p>
              )}
            </section>
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
