import type { SessionApi } from '../hooks/useSession';
import type { Duration, Intention } from '../types';
import { AccountPanel } from './AccountPanel';
import { BetaComments } from './BetaComments';
import { DeleteSessionButton, StepLayout } from './StepLayout';

type QuickPack = {
  id: string;
  title: string;
  hint: string;
  duration: Duration;
  intention: Intention;
};

const QUICK_PACKS: QuickPack[] = [
  {
    id: 'rapida-1',
    title: 'Pausa rápida · 1 min',
    hint: 'Un respiro ahora, sin cuenta.',
    duration: 1,
    intention: 'calmar-ritmo',
  },
  {
    id: 'futuro',
    title: 'Cuando el futuro te da vueltas',
    hint: 'Espacio local, en español, sin suscripción.',
    duration: 3,
    intention: 'con-el-futuro',
  },
  {
    id: 'laboral',
    title: 'Pausa laboral · 3 min',
    hint: 'Entre tareas, en el navegador.',
    duration: 3,
    intention: 'calmar-ritmo',
  },
];

export function WelcomeStep({ sessionApi }: { sessionApi: SessionApi }) {
  const startTowardConsent = (pack?: QuickPack) => {
    if (pack) {
      sessionApi.updateCheckIn({
        duration: pack.duration,
        intention: pack.intention,
        moment: pack.id === 'laboral' ? 'pausa-laboral' : 'ahora',
      });
    }
    sessionApi.setStep('consent');
  };

  return (
    <StepLayout
      title="Meditación a Medida"
      lead="Meditación guiada en español que arma el guion a tu medida: duración, práctica y experiencia. Sin app de corporación ni muro de suscripción — podés ver el texto antes de escucharlo."
      cardClassName="step-card--welcome"
      hero={
        <div className="welcome-hero">
          <p className="welcome-hero-kicker">Pausa Mía · beta</p>
          <div className="welcome-hero-mark" aria-hidden="true">
            <span className="welcome-hero-bar" />
            <span className="welcome-hero-bar" />
          </div>
          <p className="welcome-hero-benefit">
            Un momento para vos. Local, en español, asíncrono — empezás sin cuenta.
          </p>
        </div>
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => startTowardConsent()}
          >
            Comenzar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => startTowardConsent(QUICK_PACKS[0])}
          >
            Pausa rápida · 1 min
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
      <ul className="welcome-signals">
        <li className="welcome-signal">
          <span className="welcome-signal-mark" aria-hidden="true" />
          <p>
            <strong>Español primero.</strong> Guion y voz pensados para vos, no
            traducidos desde un producto en inglés.
          </p>
        </li>
        <li className="welcome-signal">
          <span className="welcome-signal-mark" aria-hidden="true" />
          <p>
            <strong>Sin corporación de por medio.</strong> En el navegador, a tu ritmo,
            con modo invitado — no EAP ni plan empresarial.
          </p>
        </li>
        <li className="welcome-signal">
          <span className="welcome-signal-mark" aria-hidden="true" />
          <p>
            <strong>Pausas cortas reales.</strong> Desde 1 minuto, cuando el día aprieta
            o la cabeza se va al después.
          </p>
        </li>
      </ul>

      <section className="welcome-packs" aria-labelledby="welcome-packs-title">
        <h3 id="welcome-packs-title" className="welcome-packs-title">
          Pausas cortas sugeridas
        </h3>
        <p className="field-hint welcome-packs-lead">
          Elegí una y seguís al permiso de sesión. No prometemos quitar la ansiedad:
          ofrecemos un espacio para estar.
        </p>
        <div className="welcome-packs-grid">
          {QUICK_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="welcome-pack"
              onClick={() => startTowardConsent(pack)}
            >
              <span className="welcome-pack-title">{pack.title}</span>
              <span className="welcome-pack-hint">{pack.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <AccountPanel
        locale={
          sessionApi.session.checkIn.voiceVariant === 'leonardo'
            ? 'es-AR'
            : sessionApi.session.checkIn.voiceVariant
        }
      />
    </StepLayout>
  );
}
