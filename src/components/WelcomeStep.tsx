import type { SessionApi } from '../hooks/useSession';
import { AccountPanel } from './AccountPanel';
import { BetaComments } from './BetaComments';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function WelcomeStep({ sessionApi }: { sessionApi: SessionApi }) {
  return (
    <StepLayout
      title="Meditación a Medida"
      lead="Una meditación guiada en español que adapta el guion a la duración, la práctica y la experiencia que elijas. Podés ver el texto antes de escucharlo."
      cardClassName="step-card--welcome"
      hero={
        <div className="welcome-hero">
          <p className="welcome-hero-kicker">Pausa Mía · beta</p>
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
        <>
          <div className="welcome-legal">
            <p>
              Para mayores de 18 años. Es una práctica de bienestar; no reemplaza
              terapia ni atención médica.
            </p>
          </div>
          <details className="collapsible-details welcome-comments">
            <summary>¿Ya probaste la demo? Dejanos un comentario</summary>
            <BetaComments />
          </details>
        </>
      }
    >
      <AccountPanel locale={sessionApi.session.checkIn.voiceVariant} />
    </StepLayout>
  );
}
