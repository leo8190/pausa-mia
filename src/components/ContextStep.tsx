import { useRef } from 'react';
import type { SessionApi } from '../hooks/useSession';
import type { ContextSource } from '../types';
import {
  CONTEXT_SOURCE_LABELS,
  CONTEXT_SOURCE_MAX_LENGTH,
  createContextSource,
  parseImportedContent,
} from '../lib/contextSources';
import { DeleteSessionButton, StepLayout } from './StepLayout';
import { FutureIntegrations } from './FutureIntegrations';

export function ContextStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { contextSources } = sessionApi.session;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateSource = (id: string, updates: Partial<ContextSource>) => {
    sessionApi.updateContextSources(
      contextSources.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  };

  const removeSource = (id: string) => {
    sessionApi.updateContextSources(contextSources.filter((s) => s.id !== id));
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const imported = parseImportedContent(text, file.name);
      sessionApi.updateContextSources([...contextSources, ...imported]);
    };
    reader.readAsText(file);
  };

  const addManualSource = () => {
    const source = createContextSource('other', 'Otra fuente manual', '');
    sessionApi.updateContextSources([...contextSources, source]);
  };

  return (
    <StepLayout
      title="Contexto adicional (opcional)"
      lead="Podés agregar entradas de diario manual o importar texto/JSON exportado por vos. Todo se procesa localmente en esta sesión."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sessionApi.setStep('summary')}
          >
            Continuar al resumen
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sessionApi.setStep('checkin')}
          >
            Volver al check-in
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <p className="field-hint">
        Cada fuente tiene un tipo visible. Podés seleccionar, previsualizar, limitar
        longitud y quitar cualquier entrada. No se simulan cuentas conectadas.
      </p>

      <div className="field">
        <label htmlFor="context-import">Importar archivo local (texto o JSON)</label>
        <input
          id="context-import"
          ref={fileInputRef}
          type="file"
          accept=".txt,.json,.md"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            e.target.value = '';
          }}
        />
        <p className="field-hint">
          Solo se lee el archivo que elegís. Máximo {CONTEXT_SOURCE_MAX_LENGTH}{' '}
          caracteres por entrada.
        </p>
      </div>

      <button type="button" className="btn btn-secondary" onClick={addManualSource}>
        Agregar otra fuente manual
      </button>

      <ul className="context-list" aria-label="Fuentes de contexto">
        {contextSources.map((source) => (
          <li className="context-item" key={source.id}>
            <div className="context-header">
              <span className="context-type-badge">
                {CONTEXT_SOURCE_LABELS[source.type]}
              </span>
              <span className="context-label">{source.label}</span>
              {source.date && <span className="field-hint"> — {source.date}</span>}
            </div>

            <label
              className="checkbox-option checkbox-option--compact"
              htmlFor={`ctx-select-${source.id}`}
            >
              <input
                type="checkbox"
                id={`ctx-select-${source.id}`}
                checked={source.selected}
                onChange={(e) =>
                  updateSource(source.id, { selected: e.target.checked })
                }
                aria-label={`Incluir ${source.label} en el guion`}
              />
              <span>Incluir en el guion</span>
            </label>

            {source.type === 'manual-diary' || source.type === 'other' ? (
              <textarea
                value={source.content}
                onChange={(e) =>
                  updateSource(source.id, {
                    content: e.target.value.slice(0, CONTEXT_SOURCE_MAX_LENGTH),
                  })
                }
                maxLength={CONTEXT_SOURCE_MAX_LENGTH}
                placeholder="Escribí una entrada breve (opcional)"
                aria-label={`Contenido de ${source.label}`}
              />
            ) : (
              <p className="context-preview">{source.content || '—'}</p>
            )}

            <p className="field-hint">
              {source.content.length}/{CONTEXT_SOURCE_MAX_LENGTH} caracteres
            </p>

            {source.type !== 'manual-diary' && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => removeSource(source.id)}
              >
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>

      <FutureIntegrations sessionApi={sessionApi} />
    </StepLayout>
  );
}
