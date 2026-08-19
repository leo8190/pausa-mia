import { useState } from 'react';
import {
  buildAiTransmissionData,
  payloadToPreviewEntries,
  serializeExactTechnicalJson,
} from '../lib/aiTransmissionPayload';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

const SECTION_LABELS = {
  operational: 'Configuración operativa',
  personal: 'Contexto personal',
  context: 'Fuentes de contexto seleccionadas',
} as const;

export function AiConsentStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { checkIn, summaryExcluded, contextSources, consent } = sessionApi.session;
  const [showTechnicalJson, setShowTechnicalJson] = useState(false);
  const payload = buildAiTransmissionData(checkIn, summaryExcluded, contextSources);
  const previewEntries = payloadToPreviewEntries(payload);
  const grouped = {
    operational: previewEntries.filter((entry) => entry.section === 'operational'),
    personal: previewEntries.filter((entry) => entry.section === 'personal'),
    context: previewEntries.filter((entry) => entry.section === 'context'),
  };
  const exactJson = serializeExactTechnicalJson(payload);

  return (
    <StepLayout
      title="Consentimiento para transmitir a IA"
      lead="Antes de enviar datos al servidor local de IA, revisá exactamente qué campos se transmitirán. Nunca se envía el diario completo ni campos excluidos. Los consentimientos no se incluyen en el cuerpo transmitido."
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
            Transmitir y generar con IA
          </button>
          {!consent.aiTransmission && (
            <p id="ai-consent-continue-hint" className="field-hint">
              Marcá el permiso de transmisión para continuar.
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
      <div className="ai-fields-preview" role="region" aria-label="Campos a transmitir">
        <h3>Datos exactos a transmitir</h3>
        {previewEntries.length === 0 ? (
          <p className="field-hint">No hay campos seleccionados para transmitir.</p>
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

      <details
        className="technical-json-details"
        open={showTechnicalJson}
        onToggle={(event) => setShowTechnicalJson(event.currentTarget.open)}
      >
        <summary>Ver datos técnicos exactos</summary>
        <pre className="technical-json" aria-label="JSON exacto transmitido">
          {exactJson}
        </pre>
      </details>

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
            Permito transmitir únicamente los campos listados arriba al servidor local
            de IA para generar el guion.{' '}
            <span id="consent-ai-hint" className="field-hint">
              Consentimiento independiente del procesamiento de sesión. La clave API
              nunca sale del servidor.
            </span>
          </span>
        </label>
      </div>

      <p className="field-hint">
        Si el servidor de IA no responde o la respuesta no cumple los límites de
        calidad, se usará automáticamente el motor local por reglas.
      </p>
    </StepLayout>
  );
}
