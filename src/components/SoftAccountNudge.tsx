import { useMemo, useState } from 'react';
import { useAccount } from '../hooks/useAccount';
import { loadGuestProgress } from '../lib/guestProgressStorage';
import {
  dismissSoftAccountNudge,
  isSoftAccountNudgeDismissed,
} from '../lib/softAccountNudgeStorage';
import { AccountPanel } from './AccountPanel';

function hasMeaningfulGuestValue(): boolean {
  const progress = loadGuestProgress();
  if (!progress) return false;
  return progress.meditationCompleted || progress.meditationCount >= 1;
}

export function SoftAccountNudge({ locale }: { locale: string }) {
  const account = useAccount();
  const [dismissed, setDismissed] = useState(() => isSoftAccountNudgeDismissed());
  const [showPanel, setShowPanel] = useState(false);
  const [accountReady, setAccountReady] = useState(false);

  const shouldShow = useMemo(() => {
    if (dismissed) return false;
    if (accountReady) return true;
    if (account.phase === 'loading' || account.phase === 'account') return false;
    if (account.user) return false;
    // Sin backend no hay CTA de crear: ocultar el nudge entero.
    if (!account.backendAvailable) return false;
    return hasMeaningfulGuestValue();
  }, [account.backendAvailable, account.phase, account.user, dismissed, accountReady]);

  if (!shouldShow) return null;

  function handleLater() {
    dismissSoftAccountNudge();
    setDismissed(true);
    setShowPanel(false);
  }

  function handleCreate() {
    setShowPanel(true);
  }

  return (
    <aside className="soft-account-nudge" role="status" aria-live="polite">
      {!accountReady && (
        <>
          <p className="soft-account-nudge-copy">
            ¿Querés guardar esta pausa en una cuenta? Apodo opcional + clave. Podés
            seguir sin cuenta.
          </p>
          <div className="soft-account-nudge-actions">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleCreate}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={handleLater}
            >
              Más tarde
            </button>
          </div>
        </>
      )}
      {showPanel && (
        <div className="soft-account-nudge-panel">
          <AccountPanel
            locale={locale}
            defaultOpen
            expandAuth
            onAccountReady={() => {
              setAccountReady(true);
            }}
          />
        </div>
      )}
      {accountReady && (
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={handleLater}
        >
          Listo
        </button>
      )}
    </aside>
  );
}
