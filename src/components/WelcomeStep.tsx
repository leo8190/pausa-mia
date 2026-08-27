import type { SessionApi } from '../hooks/useSession';
import { AccountPanel } from './AccountPanel';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function WelcomeStep({ sessionApi }: { sessionApi: SessionApi }) {
  return (
    <StepLayout
      title="Meditación a Medida"
      lead="Una pausa guiada creada con lo que elegís compartir hoy, en tu variante de español."
      cardClassName="step-card--welcome"
      hero={
        <div className="welcome-hero">
          <div className="welcome-hero-mark" aria-hidden="true">
            <span className="welcome-hero-bar" />
            <span className="welcome-hero-bar" />
          </div>
          <p className="welcome-hero-brand">Pausa Mía</p>
          <p className="welcome-hero-benefit">
            Una sesión breve, serena y privada — podés probarla sin cuenta.
          </p>
        </div>
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            aria-describedby="welcome-start-now-hint"
            onClick={() => {
              sessionApi.setEntryPath('start-now');
              sessionApi.setStep('consent');
            }}
          >
            Empezar ahora
          </button>
          <p id="welcome-start-now-hint" className="field-hint">
            3 minutos, motor local y español argentino. Solo consentimiento y revisión
            del guion; sin check-in ni contexto.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              sessionApi.setEntryPath('full');
              sessionApi.setStep('consent');
            }}
          >
            Personalizar check-in
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
      afterActions={
        <div className="welcome-legal">
          <p>
            Ofrece <strong>bienestar general</strong>: no es terapia, psicología ni
            tratamiento, y no promete curar ni resolver condiciones de salud.
          </p>
          <p>
            La primera sesión <strong>no guarda ni conecta</strong> nada. Todo se
            procesa en tu navegador y se descarta al recargar, salvo que elijas guardar
            preferencias.
          </p>
          <p>
            <strong>Solo para mayores de 18 años.</strong>
          </p>
        </div>
      }
    >
      <ul className="welcome-signals" aria-label="Señales de privacidad y uso">
        <li className="welcome-signal">
          <span className="welcome-signal-mark" aria-hidden="true" />
          <p>
            <strong>Privacidad primero.</strong> Procesamos en tu navegador; nada se
            envía por defecto.
          </p>
        </li>
        <li className="welcome-signal">
          <span className="welcome-signal-mark" aria-hidden="true" />
          <p>
            <strong>Consentimiento explícito.</strong> Las casillas no vienen
            preseleccionadas.
          </p>
        </li>
        <li className="welcome-signal">
          <span className="welcome-signal-mark" aria-hidden="true" />
          <p>
            <strong>Vos elegís qué compartir.</strong> Podés omitir cualquier dato
            sensible.
          </p>
        </li>
      </ul>
      <AccountPanel locale={sessionApi.session.checkIn.voiceVariant} />
    </StepLayout>
  );
}
