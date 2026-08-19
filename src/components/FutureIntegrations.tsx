import { useRef, useState } from 'react';
import type { SessionApi } from '../hooks/useSession';
import type { ContextSourceType } from '../types';
import { ADDABLE_SOURCES, parseSourceByType } from '../lib/contextSources';

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

  const setSourceFeedback = (
    type: ContextSourceType,
    patch: Partial<SourceFeedback>,
  ) => {
    setFeedback((prev) => ({
      ...prev,
      [type]: { ...emptyFeedback(), ...prev[type], ...patch },
    }));
  };

  const handleFile = (type: ContextSourceType, file: File) => {
    setSourceFeedback(type, {
      loading: true,
      error: null,
      success: null,
    });

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const result = parseSourceByType(type, text, file.name);
      if (result.sources.length > 0) {
        sessionApi.updateContextSources([...contextSources, ...result.sources]);
        const count = result.sources.length;
        setSourceFeedback(type, {
          loading: false,
          error: result.error,
          success:
            count === 1
              ? 'Se agregó 1 entrada a tus fuentes de esta sesión. Podés incluirla o quitarla arriba.'
              : `Se agregaron ${count} entradas a tus fuentes de esta sesión. Podés incluirlas o quitarlas arriba.`,
        });
      } else {
        setSourceFeedback(type, {
          loading: false,
          error:
            result.error ??
            'No encontramos contenido usable en ese archivo. Probá con otra exportación.',
          success: null,
        });
      }
    };
    reader.onerror = () => {
      setSourceFeedback(type, {
        loading: false,
        error: 'No pudimos leer ese archivo en este navegador. Podés reintentar.',
        success: null,
      });
    };
    reader.readAsText(file);
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
                  Conexión en línea: no disponible
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
                  }`}
                >
                  {state.loading ? 'Leyendo archivo…' : 'Elegir archivo local'}
                  <input
                    ref={(el) => {
                      fileInputs.current[source.type] = el;
                    }}
                    type="file"
                    accept={source.accept}
                    className="addable-source-file-input"
                    disabled={state.loading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(source.type, file);
                      e.target.value = '';
                    }}
                    aria-label={`Importar archivo local para ${source.title}`}
                    aria-describedby={`addable-status-${source.type}`}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled
                  title="Requiere OAuth y configuración que este prototipo no implementa"
                  aria-disabled="true"
                >
                  {source.onlineConnectionLabel}
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
                esta sesión. No se guarda ni se envía a ningún servidor por defecto.
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
