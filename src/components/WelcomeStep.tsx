import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function WelcomeStep({ sessionApi }: { sessionApi: SessionApi }) {
  return (
    <StepLayout
      title="Meditación a Medida"
      lead="Una pausa guiada creada con lo que elegís compartir hoy, en tu variante de español."
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
      <p>
        Esta herramienta ofrece <strong>bienestar general</strong>, no terapia,
        psicología ni tratamiento. No promete curar, reducir ni resolver condiciones de
        salud.
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
    </StepLayout>
  );
}
