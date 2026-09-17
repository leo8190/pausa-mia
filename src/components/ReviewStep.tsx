import { FIELD_LABELS } from '../types';
import { DURATION_TOLERANCE_MINUTES } from '../lib/durationEstimator';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function ReviewStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { script, scriptFallbackUsed } = sessionApi.session;
  if (!script) return null;
  const usedDetailLabels = script.usedDetails
    .map((detail) => FIELD_LABELS[detail])
    .filter(Boolean);

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
          {scriptFallbackUsed
            ? 'Preparamos tu guion en este dispositivo porque no pudimos usar la inteligencia artificial.'
            : script.engine === 'ai'
              ? 'Guion preparado con ayuda de inteligencia artificial.'
              : 'Guion preparado para vos.'}
        </p>
        {usedDetailLabels.length > 0 && (
          <p className="field-hint">
            Personalizado con: {usedDetailLabels.join(', ')}.
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
