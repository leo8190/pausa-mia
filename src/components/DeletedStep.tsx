import type { SessionApi } from '../hooks/useSession';
import { hasStoredPreferences } from '../lib/preferencesStorage';
import { StepLayout } from './StepLayout';

export function DeletedStep({ sessionApi }: { sessionApi: SessionApi }) {
  const empty = sessionApi.isSessionEmpty;
  const prefsGone = !hasStoredPreferences();
  const allClear = empty && prefsGone;

  return (
    <StepLayout
      title="Sesión borrada"
      cardClassName="step-card--deleted"
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => sessionApi.resetToWelcome()}
        >
          Volver al inicio
        </button>
      }
    >
      <div
        className={`wipe-confirmation${allClear ? ' wipe-confirmation--ok' : ' wipe-confirmation--warn'}`}
        role="status"
        aria-live="polite"
        data-testid="wipe-confirmation"
      >
        <p className="wipe-confirmation-title" id="wipe-confirmation-title">
          {allClear ? 'Borrado confirmado' : 'Borrado incompleto'}
        </p>
        <p className="wipe-confirmation-lead">
          {allClear
            ? 'Tus respuestas, diario, guion y preferencias se borraron de este dispositivo. Tu cuenta no se eliminó.'
            : 'Quedaron datos sin borrar. Volvé al inicio e intentá de nuevo.'}
        </p>
      </div>
    </StepLayout>
  );
}
