import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function ConsentStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { consent } = sessionApi.session;

  return (
    <StepLayout
      title="Consentimiento de sesión"
      lead="Nada se procesa sin tu permiso explícito. Las casillas no están preseleccionadas."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!sessionApi.isConsentValid}
            aria-describedby={
              sessionApi.isConsentValid ? undefined : 'consent-continue-hint'
            }
            onClick={() => sessionApi.setStep('checkin')}
          >
            Continuar al check-in
          </button>
          {!sessionApi.isConsentValid && (
            <p id="consent-continue-hint" className="field-hint">
              Marcá el permiso de sesión para continuar.
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sessionApi.setStep('welcome')}
          >
            Volver
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <div className="field">
        <label className="checkbox-option" htmlFor="consent-session">
          <input
            type="checkbox"
            id="consent-session"
            checked={consent.sessionProcessing}
            onChange={(e) =>
              sessionApi.updateConsent({ sessionProcessing: e.target.checked })
            }
            aria-describedby="consent-session-hint"
          />
          <span>
            Permito usar mis respuestas de esta sesión únicamente para crear el guion y
            reproducir el audio.{' '}
            <span id="consent-session-hint" className="field-hint">
              Requerido para continuar.
            </span>
          </span>
        </label>
      </div>

      <div className="field">
        <label className="checkbox-option" htmlFor="consent-preferences">
          <input
            type="checkbox"
            id="consent-preferences"
            checked={consent.savePreferences}
            onChange={(e) =>
              sessionApi.updateConsent({ savePreferences: e.target.checked })
            }
            aria-describedby="consent-preferences-hint"
          />
          <span>
            Guardar mis preferencias localmente en este dispositivo (opcional).{' '}
            <span id="consent-preferences-hint" className="field-hint">
              Solo se guardan variante de español, duración y estilo de práctica. Nunca
              diario, situación ni estado emocional.
            </span>
          </span>
        </label>
      </div>
    </StepLayout>
  );
}
