import type { SessionApi } from '../hooks/useSession';
import { useAddToHome } from '../hooks/useAddToHome';
import {
  COLLECTIONS,
  RAPIDA_1_MIN,
  collectionCheckInFields,
  type CollectionPreset,
} from '../lib/collections';
import { loadGuestProgress } from '../lib/guestProgressStorage';
import { AccountPanel } from './AccountPanel';
import { BetaComments } from './BetaComments';
import { WhoMakesThis } from './WhoMakesThis';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function WelcomeStep({ sessionApi }: { sessionApi: SessionApi }) {
  const guestCount = loadGuestProgress()?.meditationCount ?? 0;
  const guestHabitLabel =
    guestCount === 1
      ? 'Llevás 1 pausa en este dispositivo.'
      : guestCount > 1
        ? `Llevás ${guestCount} pausas en este dispositivo.`
        : null;
  const { canPrompt, isInstalled, promptInstall, hint } = useAddToHome();

  const startTowardConsent = (preset?: CollectionPreset) => {
    if (preset) {
      sessionApi.updateCheckIn(collectionCheckInFields(preset));
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
          <p className="welcome-browser-line">
            Funciona en el navegador · sin app — empezá gratis
          </p>
          {guestHabitLabel && (
            <p className="welcome-habit" role="status">
              {guestHabitLabel}
            </p>
          )}
        </div>
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => startTowardConsent()}
          >
            Empezar gratis sin cuenta
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => startTowardConsent(RAPIDA_1_MIN)}
          >
            Pausa rápida · 1 min
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
      afterActions={
        <>
          {!isInstalled && (
            <div className="welcome-a2hs">
              {canPrompt ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-small welcome-a2hs-btn"
                  onClick={() => {
                    void promptInstall();
                  }}
                >
                  Agregar a inicio
                </button>
              ) : (
                hint && (
                  <p className="welcome-a2hs-hint field-hint">{hint}</p>
                )
              )}
            </div>
          )}
          <details className="collapsible-details welcome-plans">
            <summary>Cómo funciona (sin muro de pago)</summary>
            <div className="welcome-plans-body">
              <p>
                <strong>Núcleo gratis.</strong> Empezás gratis sin cuenta: como
                invitado, sin tarjeta ni suscripción obligatoria.
              </p>
              <p>
                La cuenta es opcional — cuando exista, te va a servir para
                guardar preferencias o retomar después, no como requisito para
                pausar.
              </p>
              <p>
                Como invitado, tu progreso seguro (duración, estilo, pausas
                completadas) se guarda en este dispositivo — nunca el diario ni
                textos personales — para retomar después o vincularlo cuando haya
                cuenta.
              </p>
              <p className="welcome-plans-support">
                Más adelante, un apoyo opcional para quien quiera sostener el
                proyecto. Por ahora no hay planes de pago ni precios: el foco es
                el espacio libre.
              </p>
            </div>
          </details>
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
          Colecciones
        </h3>
        <p className="field-hint welcome-packs-lead">
          Elegí una y se completan duración, práctica y experiencia. No prometemos
          quitar la ansiedad: ofrecemos un espacio para estar.
        </p>
        <div className="welcome-packs-grid">
          {COLLECTIONS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="welcome-pack"
              onClick={() => startTowardConsent(preset)}
            >
              <span className="welcome-pack-title">{preset.title}</span>
              <span className="welcome-pack-hint">{preset.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <WhoMakesThis />

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
