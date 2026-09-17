import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function ReviewStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { script, scriptFallbackUsed } = sessionApi.session;
  if (!script) return null;

  return (
    <StepLayout
      title="Tu meditación"
      lead="Podés leerla antes de escucharla."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sessionApi.setStep('playback')}
          >
            Reproducir audio
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sessionApi.setStep('summary')}
          >
            Volver al resumen
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <div className="script-meta">
        <h3 className="script-title">{script.title}</h3>
        <p className="field-hint">
          Duración aproximada: {script.estimatedMinutes} minutos
        </p>
        {scriptFallbackUsed && (
          <p className="field-hint" role="status">
            No pudimos usar la inteligencia artificial. Preparamos esta meditación con
            tus respuestas en este dispositivo.
          </p>
        )}
      </div>
      <div className="script-preview" role="region" aria-label="Texto del guion">
        {script.segments.map((seg, i) => (
          <p className="script-segment" key={i}>
            {seg.text}
          </p>
        ))}
      </div>
    </StepLayout>
  );
}
