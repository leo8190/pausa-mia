import { useRef, useState } from 'react';
import type { SessionApi } from '../hooks/useSession';
import type { ContextSourceType } from '../types';
import {
  ADDABLE_SOURCES,
  limitImportFiles,
  parseSourceByType,
} from '../lib/contextSources';
import { getOnlineConnectorStatus } from '../lib/onlineConnector';

type SourceFeedback = {
  loading: boolean;
  error: string | null;
  success: string | null;
};

const emptyFeedback = (): SourceFeedback => ({
  loading: false,
  error: null,
  success: null,
});

/**
 * Sección "Fuentes que podés agregar": reemplaza la lista puramente
 * desactivada anterior por opciones accionables con consentimiento explícito
 * por fuente. Cada fuente se agrega importando un archivo local (nunca por
 * OAuth) y queda visible en la lista de fuentes de contexto, donde se puede
 * incluir, previsualizar o quitar. Las conexiones en línea equivalentes
 * quedan siempre deshabilitadas.
 */
export function FutureIntegrations({ sessionApi }: { sessionApi: SessionApi }) {
  const { contextSources } = sessionApi.session;
  const [feedback, setFeedback] = useState<Record<string, SourceFeedback>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const onlineConnector = getOnlineConnectorStatus();

  const setSourceFeedback = (
    type: ContextSourceType,
    patch: Partial<SourceFeedback>,
  ) => {
    setFeedback((prev) => ({
      ...prev,
      [type]: { ...emptyFeedback(), ...prev[type], ...patch },
    }));
  };

  const readFileText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () =>
        reject(new Error('No pudimos leer ese archivo en este navegador.'));
      reader.readAsText(file);
    });

  const handleFiles = (type: ContextSourceType, files: FileList | File[]) => {
    const limited = limitImportFiles(files);
    const selectedFiles = limited.files;
    if (selectedFiles.length === 0) return;

    setSourceFeedback(type, {
      loading: true,
      error: null,
      success: null,
    });

    void Promise.all(
      selectedFiles.map((file) => readFileText(file).then((text) => ({ text, file }))),
    )
      .then((loadedFiles) => {
        const parsed = loadedFiles.map(({ text, file }) =>
          parseSourceByType(type, text, file.name),
        );
        const sources = parsed.flatMap((result) => result.sources);
        const errors = parsed
          .map((result) => result.error)
          .filter((error): error is string => Boolean(error));

        if (sources.length > 0) {
          sessionApi.updateContextSources([...contextSources, ...sources]);
          setSourceFeedback(type, {
            loading: false,
            error:
              errors.length > 0
                ? errors.join(' ')
                : limited.truncated
                  ? `Se procesaron sólo los primeros ${selectedFiles.length} archivos para cuidar el rendimiento.`
                  : null,
            success:
              sources.length === 1
                ? 'Se agregó 1 entrada a tus fuentes de esta sesión. Podés incluirla o quitarla arriba.'
                : `Se agregaron ${sources.length} entradas a tus fuentes de esta sesión. Podés incluirlas o quitarlas arriba.`,
          });
          return;
        }

        setSourceFeedback(type, {
          loading: false,
          error:
            errors.join(' ') ||
            (limited.truncated
              ? `Se procesaron sólo los primeros ${selectedFiles.length} archivos y no encontramos contenido usable.`
              : 'No encontramos contenido usable en esos archivos. Probá con otra exportación.'),
          success: null,
        });
      })
      .catch((error: unknown) => {
        setSourceFeedback(type, {
          loading: false,
          error:
            error instanceof Error
              ? `${error.message} Podés reintentar.`
              : 'No pudimos leer esos archivos en este navegador. Podés reintentar.',
          success: null,
        });
      });
  };

  return (
    <section className="future-section" aria-label="Fuentes que podés agregar">
      <h3>Fuentes que podés agregar</h3>
      <p className="field-hint">
        Cada fuente se agrega importando un archivo exportado por vos mismo/a, sólo para
        esta sesión. No pedimos ni usamos OAuth, ni enviamos nada a servidores de
        terceros. Después de agregarla, la vas a ver en la lista de fuentes de arriba,
        con casilla para incluirla en el guion y opción de quitarla en cualquier
        momento.
      </p>
      <p className="field-hint" role="status">
        Estado de conexiones online: {onlineConnector.reason}
      </p>
      <ul className="addable-source-list">
        {ADDABLE_SOURCES.map((source) => {
          const state = feedback[source.type] ?? emptyFeedback();
          return (
            <li
              className="addable-source-item"
              key={source.type}
              aria-busy={state.loading || undefined}
            >
              <div className="addable-source-header">
                <strong>{source.title}</strong>
                <span className="future-badge future-badge--disabled">
                  {onlineConnector.configured
                    ? 'Configuración detectada; conexión apagada'
                    : 'Conexión en línea: no disponible'}
                </span>
              </div>
              <p className="field-hint">{source.description}</p>
              <p className="field-hint">
                Sin conexión online: elegí un archivo local exportado por vos. El botón
                de conexión en línea queda desactivado a propósito; este prototipo no
                implementa OAuth ni credenciales.
              </p>

              <div className="addable-source-actions">
                <label
                  className={`btn btn-secondary btn-small addable-source-file-label${
                    state.loading ? ' is-loading' : ''
                  }${state.error ? ' has-error' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFiles(source.type, event.dataTransfer.files);
                  }}
                >
                  {state.loading ? 'Leyendo archivos…' : 'Elegir o soltar archivos'}
                  <input
                    ref={(el) => {
                      fileInputs.current[source.type] = el;
                    }}
                    type="file"
                    accept={source.accept}
                    multiple
                    className="addable-source-file-input"
                    disabled={state.loading}
                    aria-invalid={state.error ? true : undefined}
                    onChange={(e) => {
                      if (e.target.files) handleFiles(source.type, e.target.files);
                      e.target.value = '';
                    }}
                    aria-label={`Importar uno o más archivos locales para ${source.title}`}
                    aria-describedby={`addable-status-${source.type}`}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled
                  title={onlineConnector.reason}
                  aria-disabled="true"
                >
                  {source.onlineConnectionLabel} (desactivada)
                </button>
              </div>

              <div
                id={`addable-status-${source.type}`}
                className="addable-source-status"
                aria-live="polite"
                aria-atomic="true"
              >
                {state.loading && (
                  <p className="field-hint" role="status">
                    Leyendo el archivo en tu dispositivo… no se envía a ningún servidor.
                  </p>
                )}
                {state.error && (
                  <p className="field-hint field-hint--error" role="alert">
                    {state.error}{' '}
                    <span className="field-hint">
                      Podés elegir otro archivo cuando quieras.
                    </span>
                  </p>
                )}
                {state.success && !state.error && (
                  <p className="field-hint field-hint--success" role="status">
                    {state.success}
                  </p>
                )}
              </div>

              <p className="field-hint">
                El contenido de este archivo se procesa sólo en tu navegador, durante
                esta sesión. Podés elegir varios archivos o soltarlos sobre el botón. No
                se guarda ni se envía a ningún servidor por defecto.
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
