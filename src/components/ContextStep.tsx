import { useState } from 'react';
import type { SessionApi } from '../hooks/useSession';
import type { ContextSource } from '../types';
import {
  CONTEXT_SOURCE_MAX_LENGTH,
  createContextSource,
  limitImportFiles,
  parseImportedContent,
} from '../lib/contextSources';
import { useLocalFileDrop } from '../hooks/useLocalFileDrop';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function ContextStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { contextSources } = sessionApi.session;
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
            reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
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
        setImportNotice('No pudimos leer el archivo. Podés elegir otro.');
      });
  };

  const fileDrop = useLocalFileDrop(handleImport);

  const addManualSource = () => {
    const source = createContextSource('other', 'Otra nota', '');
    sessionApi.updateContextSources([...contextSources, source]);
  };

  return (
    <StepLayout
      title="Contexto adicional (opcional)"
      lead="Si querés, contanos un poco más. Usaremos sólo las notas que elijas para esta meditación."
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
            Volver
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <ul className="context-list" aria-label="Fuentes de contexto">
        {contextSources.map((source) => {
          const label =
            source.type === 'manual-diary'
              ? source.label.replace(/^Diario manual — /, '')
              : source.label;
          return (
            <li className="context-item" key={source.id}>
              <div className="context-header">
                <span className="context-label">{label}</span>
                {source.type !== 'manual-diary' && source.date && (
                  <span className="field-hint"> — {source.date}</span>
                )}
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
                  aria-label={`Usar la nota de ${label} en la meditación`}
                />
                <span>Usar esta nota</span>
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
                  aria-label={`Tu nota de ${label}`}
                />
              ) : (
                <p className="context-preview">{source.content || '—'}</p>
              )}

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
          );
        })}
      </ul>

      <details className="collapsible-details">
        <summary>Agregar otra nota o archivo</summary>
        <button type="button" className="btn btn-secondary" onClick={addManualSource}>
          Agregar otra nota
        </button>
        <div
          className={`field context-import-drop${fileDrop.active ? ' is-active' : ''}`}
          {...fileDrop.handlers}
        >
          <label htmlFor="context-import">Elegir un archivo</label>
          <input
            id="context-import"
            type="file"
            accept=".txt,.json,.md"
            multiple
            onChange={(e) => {
              if (e.target.files) handleImport(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="field-hint">
            Aceptamos archivos de texto (.txt, .md o .json). Sólo se leen los archivos
            que elegís, en este dispositivo. Podés revisar el contenido antes de usarlo.
          </p>
          {importNotice && <p className="field-hint">{importNotice}</p>}
        </div>
      </details>
    </StepLayout>
  );
}
