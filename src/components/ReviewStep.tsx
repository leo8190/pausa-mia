import { ENGINE_LABELS } from '../types';
import { DURATION_TOLERANCE_MINUTES } from '../lib/durationEstimator';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function ReviewStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { script, scriptFallbackUsed } = sessionApi.session;
  if (!script) return null;

  return (
    <StepLayout
      title="Revisión del guion"
      lead="Leé el texto completo antes de reproducirlo."
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
          Intención: {script.intentionLabel} · Objetivo: {script.targetDuration} min ·
          Estimada: {script.estimatedMinutes} min (±{DURATION_TOLERANCE_MINUTES})
        </p>
        <p className="engine-badge" role="status">
          Motor: {ENGINE_LABELS[script.engine]}
          {scriptFallbackUsed && ' (fallback local aplicado)'}
        </p>
        {script.usedDetails.length > 0 && (
          <p className="field-hint">Detalles usados: {script.usedDetails.join(', ')}</p>
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
