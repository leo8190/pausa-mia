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
            onClick={() => sessionApi.setStep('checkin')}
          >
            Continuar al check-in
          </button>
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
        <div className="checkbox-option">
          <input
            type="checkbox"
            id="consent-session"
            checked={consent.sessionProcessing}
            onChange={(e) =>
              sessionApi.updateConsent({ sessionProcessing: e.target.checked })
            }
            aria-describedby="consent-session-hint"
          />
          <label htmlFor="consent-session">
            Permito usar mis respuestas de esta sesión únicamente para crear el guion y
            reproducir el audio.{' '}
            <span id="consent-session-hint" className="field-hint">
              Requerido para continuar.
            </span>
          </label>
        </div>
      </div>

      <div className="field">
        <div className="checkbox-option">
          <input
            type="checkbox"
            id="consent-preferences"
            checked={consent.savePreferences}
            onChange={(e) =>
              sessionApi.updateConsent({ savePreferences: e.target.checked })
            }
            aria-describedby="consent-preferences-hint"
          />
          <label htmlFor="consent-preferences">
            Guardar mis preferencias localmente en este dispositivo (opcional).{' '}
            <span id="consent-preferences-hint" className="field-hint">
              Solo se guardan variante de español, duración y estilo de práctica. Nunca
              diario, situación ni estado emocional.
            </span>
          </label>
        </div>
      </div>
    </StepLayout>
  );
}
