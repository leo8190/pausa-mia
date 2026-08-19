import { useRef, useState } from 'react';
import type { SessionApi } from '../hooks/useSession';
import type { ContextSourceType } from '../types';
import { ADDABLE_SOURCES, parseSourceByType } from '../lib/contextSources';

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
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFile = (type: ContextSourceType, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const result = parseSourceByType(type, text, file.name);
      setErrors((prev) => ({ ...prev, [type]: result.error }));
      if (result.sources.length > 0) {
        sessionApi.updateContextSources([...contextSources, ...result.sources]);
      }
    };
    reader.onerror = () => {
      setErrors((prev) => ({
        ...prev,
        [type]: 'No pudimos leer ese archivo en este navegador. Podés reintentar.',
      }));
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
        {ADDABLE_SOURCES.map((source) => (
          <li className="addable-source-item" key={source.type}>
            <div className="addable-source-header">
              <strong>{source.title}</strong>
              <span className="future-badge future-badge--disabled">
                Conexión en línea: no disponible
              </span>
            </div>
            <p className="field-hint">{source.description}</p>

            <div className="addable-source-actions">
              <label className="btn btn-secondary btn-small addable-source-file-label">
                Elegir archivo local
                <input
                  ref={(el) => {
                    fileInputs.current[source.type] = el;
                  }}
                  type="file"
                  accept={source.accept}
                  className="addable-source-file-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(source.type, file);
                    e.target.value = '';
                  }}
                  aria-label={`Importar archivo local para ${source.title}`}
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

            {errors[source.type] && (
              <p className="field-hint field-hint--error" role="alert">
                {errors[source.type]}{' '}
                <span className="field-hint">
                  Podés elegir otro archivo cuando quieras.
                </span>
              </p>
            )}

            <p className="field-hint">
              El contenido de este archivo se procesa sólo en tu navegador, durante esta
              sesión. No se guarda ni se envía a ningún servidor por defecto.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
