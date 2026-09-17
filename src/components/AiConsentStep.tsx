import {
  buildAiTransmissionData,
  payloadToPreviewEntries,
} from '../lib/aiTransmissionPayload';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

const SECTION_LABELS = {
  operational: 'Tu práctica',
  personal: 'Sobre vos',
  context: 'Contexto que elegiste',
} as const;

export function AiConsentStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { checkIn, summaryExcluded, contextSources, consent } = sessionApi.session;
  const payload = buildAiTransmissionData(checkIn, summaryExcluded, contextSources);
  const previewEntries = payloadToPreviewEntries(payload);
  const grouped = {
    operational: previewEntries.filter((entry) => entry.section === 'operational'),
    personal: previewEntries.filter((entry) => entry.section === 'personal'),
    context: previewEntries.filter((entry) => entry.section === 'context'),
  };

  return (
    <StepLayout
      title="Antes de compartir tus datos"
      lead="Para crear tu meditación con inteligencia artificial, enviaremos sólo los datos que ves abajo al servicio de IA. Podés volver para cambiar esta selección."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!consent.aiTransmission}
            aria-describedby={
              consent.aiTransmission ? undefined : 'ai-consent-continue-hint'
            }
            onClick={() => sessionApi.confirmAiGenerate()}
          >
            Crear mi meditación con IA
          </button>
          {!consent.aiTransmission && (
            <p id="ai-consent-continue-hint" className="field-hint">
              Necesitamos tu permiso para compartir estos datos.
            </p>
          )}
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
      <div
        className="ai-fields-preview"
        role="region"
        aria-label="Datos que se compartirán"
      >
        <h3>Esto es lo que se compartirá</h3>
        {previewEntries.length === 0 ? (
          <p className="field-hint">No elegiste datos para compartir.</p>
        ) : (
          (['operational', 'personal', 'context'] as const).map((section) => {
            const entries = grouped[section];
            if (entries.length === 0) return null;
            return (
              <section key={section} aria-label={SECTION_LABELS[section]}>
                <h4>{SECTION_LABELS[section]}</h4>
                <ul className="summary-list">
                  {entries.map((entry) => (
                    <li className="summary-item" key={`${section}-${entry.label}`}>
                      <span className="summary-label">{entry.label}</span>
                      <span className="summary-value">{entry.value}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      <div className="field">
        <label className="checkbox-option" htmlFor="consent-ai">
          <input
            type="checkbox"
            id="consent-ai"
            checked={consent.aiTransmission}
            onChange={(e) =>
              sessionApi.updateConsent({ aiTransmission: e.target.checked })
            }
            aria-describedby="consent-ai-hint"
          />
          <span>
            Autorizo enviar sólo los datos mostrados arriba al servicio de inteligencia
            artificial para crear mi meditación.{' '}
            <span id="consent-ai-hint" className="field-hint">
              Este permiso es opcional y vale sólo para esta sesión.
            </span>
          </span>
        </label>
      </div>

      <p className="field-hint">
        Si la inteligencia artificial no está disponible, prepararemos la meditación en
        tu dispositivo.
      </p>
    </StepLayout>
  );
}
