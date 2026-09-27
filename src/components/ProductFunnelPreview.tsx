import { useSyncExternalStore } from 'react';
import { isFunnelPreviewEnabled, productFunnel } from '../lib/productFunnel';

/** Developer preview only; no user-facing production analytics is activated. */
export function ProductFunnelPreview() {
  useSyncExternalStore(productFunnel.subscribe, productFunnel.revision, () => 0);
  const consent = productFunnel.isConsented();
  if (!isFunnelPreviewEnabled()) return null;
  return (
    <aside className="step-card" aria-label="Prueba local de métricas">
      <label className="checkbox-option">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => productFunnel.setConsent(event.target.checked)}
        />
        Permito registrar los pasos de esta prueba local (opcional).
      </label>
      <p className="field-hint">
        Solo nombres de pasos y día, sin respuestas, textos, audio ni datos de cuenta.
        Estas métricas no salen del navegador. Se borra al desmarcar, borrar la sesión,
        iniciar otra o cerrar/recargar la página. Esto no mide visitantes reales.
      </p>
      {consent && (
        <ol aria-label="Pasos observados en esta prueba">
          {productFunnel.snapshot().map(({ event, dayUtc }) => (
            <li key={event}>
              {event} · {dayUtc} UTC
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
