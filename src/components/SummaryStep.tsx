import { FIELD_LABELS, ENGINE_LABELS } from '../types';
import { getCheckInSummaryValue } from '../lib/checkInSummary';
import { DURATION_TOLERANCE_MINUTES } from '../lib/durationEstimator';
import { getSelectedContextSources } from '../lib/contextSources';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

const SUMMARY_FIELDS = [
  'name',
  'moment',
  'recentSituation',
  'perceivedState',
  'intention',
  'experience',
  'style',
  'avoidTopics',
  'duration',
  'voiceVariant',
];

export function SummaryStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { checkIn, summaryExcluded, useAiEngine, aiAvailable, contextSources } =
    sessionApi.session;
  const selectedContext = getSelectedContextSources(contextSources);

  return (
    <StepLayout
      title="Resumen editable"
      lead="Esta es la información que se usará para crear tu guion. Podés quitar cualquier dato."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sessionApi.tryGenerate()}
          >
            Generar guion
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sessionApi.setStep('context')}
          >
            Editar contexto
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sessionApi.setStep('checkin')}
          >
            Editar check-in
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <ul className="summary-list" aria-label="Datos de la sesión">
        {SUMMARY_FIELDS.map((field) => {
          const value = getCheckInSummaryValue(field, checkIn);
          const excluded = summaryExcluded.has(field);
          const isOptional =
            field === 'name' || field === 'recentSituation' || field === 'avoidTopics';

          if (!value && isOptional) return null;

          return (
            <li className="summary-item" key={field}>
              <span className="summary-label">{FIELD_LABELS[field]}</span>
              <span className="summary-value">
                {excluded ? <em>Excluido del guion</em> : value || '—'}
              </span>
              <div className="checkbox-option">
                <input
                  type="checkbox"
                  id={`exclude-${field}`}
                  checked={excluded}
                  onChange={() => sessionApi.toggleExcluded(field)}
                  aria-label={`Excluir ${FIELD_LABELS[field]} del guion`}
                />
                <label htmlFor={`exclude-${field}`}>Excluir</label>
              </div>
            </li>
          );
        })}
        {selectedContext.length > 0 && (
          <li className="summary-item">
            <span className="summary-label">{FIELD_LABELS.contextSources}</span>
            <span className="summary-value">
              {selectedContext.map((s) => s.label).join(', ')}
            </span>
          </li>
        )}
      </ul>

      <fieldset className="field">
        <legend>Motor de generación</legend>
        <div className="radio-group">
          <div className="radio-option">
            <input
              type="radio"
              id="engine-local"
              name="engine"
              checked={!useAiEngine}
              onChange={() => sessionApi.setUseAiEngine(false)}
            />
            <label htmlFor="engine-local">{ENGINE_LABELS.local}</label>
          </div>
          <div className="radio-option">
            <input
              type="radio"
              id="engine-ai"
              name="engine"
              checked={useAiEngine}
              disabled={!aiAvailable}
              onChange={() => sessionApi.setUseAiEngine(true)}
            />
            <label htmlFor="engine-ai">
              {ENGINE_LABELS.ai}
              {!aiAvailable && ' (no disponible — servidor sin proveedor configurado)'}
            </label>
          </div>
        </div>
        <p className="field-hint">
          Tolerancia de duración estimada: ±{DURATION_TOLERANCE_MINUTES} min respecto a
          la opción elegida.
        </p>
      </fieldset>
    </StepLayout>
  );
}
