import { useRef, useState } from 'react';
import type { SessionApi } from '../hooks/useSession';
import type { ContextSource } from '../types';
import {
  CONTEXT_SOURCE_LABELS,
  CONTEXT_SOURCE_MAX_LENGTH,
  createContextSource,
  limitImportFiles,
  parseImportedContent,
} from '../lib/contextSources';
import { useLocalFileDrop } from '../hooks/useLocalFileDrop';
import { DeleteSessionButton, StepLayout } from './StepLayout';
import { FutureIntegrations } from './FutureIntegrations';

export function ContextStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { contextSources } = sessionApi.session;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const updateSource = (id: string, updates: Partial<ContextSource>) => {
    sessionApi.updateContextSources(
      contextSources.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  };

  const removeSource = (id: string) => {
    sessionApi.updateContextSources(contextSources.filter((s) => s.id !== id));
  };

  const handleImport = (files: FileList | File[]) => {
    const limited = limitImportFiles(files);
    const selectedFiles = limited.files;
    if (selectedFiles.length === 0) return;
    setImportNotice(
      limited.truncated
        ? `Se procesarán sólo los primeros ${selectedFiles.length} archivos para cuidar el rendimiento.`
        : null,
    );

    void Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise<{ file: File; text: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ file, text: String(reader.result ?? '') });
            reader.onerror = () =>
              reject(new Error('No se pudo leer un archivo local.'));
            reader.readAsText(file);
          }),
      ),
    )
      .then((loadedFiles) => {
        const imported = loadedFiles.flatMap(({ file, text }) =>
          parseImportedContent(text, file.name),
        );
        sessionApi.updateContextSources([...contextSources, ...imported]);
      })
      .catch(() => {
        // El input no envía datos: si un archivo falla, se conserva el estado actual.
      });
  };

  const fileDrop = useLocalFileDrop(handleImport);

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

      <button type="button" className="btn btn-secondary" onClick={addManualSource}>
        Agregar otra fuente manual
      </button>

      <details className="collapsible-details">
        <summary>Agregar contexto opcional</summary>
        <div
          className={`field context-import-drop${fileDrop.active ? ' is-active' : ''}`}
          {...fileDrop.handlers}
        >
          <label htmlFor="context-import">Importar archivo local (texto o JSON)</label>
          <input
            id="context-import"
            ref={fileInputRef}
            type="file"
            accept=".txt,.json,.md"
            multiple
            onChange={(e) => {
              if (e.target.files) handleImport(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="field-hint">
            Solo se leen los archivos que elegís. Podés seleccionar varios. Máximo{' '}
            {CONTEXT_SOURCE_MAX_LENGTH} caracteres por entrada.
          </p>
          {importNotice && <p className="field-hint">{importNotice}</p>}
        </div>

        <FutureIntegrations sessionApi={sessionApi} />
      </details>
    </StepLayout>
  );
}
