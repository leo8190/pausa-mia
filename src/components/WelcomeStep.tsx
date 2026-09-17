import type { SessionApi } from '../hooks/useSession';
import { AccountPanel } from './AccountPanel';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function WelcomeStep({ sessionApi }: { sessionApi: SessionApi }) {
  return (
    <StepLayout
      title="Meditación a Medida"
      lead="Una pausa guiada con lo que elegís compartir hoy."
      cardClassName="step-card--welcome"
      hero={
        <div className="welcome-hero">
          <div className="welcome-hero-mark" aria-hidden="true">
            <span className="welcome-hero-bar" />
            <span className="welcome-hero-bar" />
          </div>
          <p className="welcome-hero-benefit">
            Un momento para vos. Podés empezar sin cuenta.
          </p>
        </div>
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sessionApi.setStep('consent')}
          >
            Comenzar
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
      afterActions={
        <div className="welcome-legal">
          <p>
            Para mayores de 18 años. Es una práctica de bienestar; no reemplaza terapia
            ni atención médica.
          </p>
        </div>
      }
    >
      <AccountPanel locale={sessionApi.session.checkIn.voiceVariant} />
    </StepLayout>
  );
}
