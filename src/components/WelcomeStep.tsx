import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function WelcomeStep({ sessionApi }: { sessionApi: SessionApi }) {
  return (
    <StepLayout
      title="Meditación a Medida"
      lead="Una pausa guiada creada con lo que elegís compartir hoy, en tu variante de español."
      cardClassName="step-card--welcome"
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
    >
      <div className="welcome-hero" aria-hidden="true">
        <p className="welcome-hero-kicker">Tu pausa, a tu medida</p>
        <p className="welcome-hero-benefit">
          Una sesión breve, serena y privada — sin cuentas ni conexiones.
        </p>
      </div>

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

      <div className="welcome-legal">
        <p>
          Esta herramienta ofrece <strong>bienestar general</strong>, no terapia,
          psicología ni tratamiento. No promete curar, reducir ni resolver condiciones
          de salud.
        </p>
        <p>
          La primera sesión <strong>no guarda ni conecta</strong> información. Todo se
          procesa en tu navegador y se descarta al recargar, salvo que elijas guardar
          preferencias más adelante.
        </p>
        <p>
          <strong>Solo para mayores de 18 años.</strong> Podés omitir cualquier dato
          sensible.
        </p>
      </div>
    </StepLayout>
  );
}
