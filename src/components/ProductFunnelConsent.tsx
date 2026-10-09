import { useSyncExternalStore } from 'react';
import { isFunnelProductionEnabled, productFunnel } from '../lib/productFunnel';
import { isUsageTrackingExcluded } from '../lib/usagePrivacy';

/** Separate, optional permission. Never blocks meditation or creates an account. */
export function ProductFunnelConsent({ deleted = false }: { deleted?: boolean }) {
  useSyncExternalStore(productFunnel.subscribe, productFunnel.revision, () => 0);
  if (!isFunnelProductionEnabled()) return null;
  const deletionStatus = productFunnel.deletionStatus();
  const excluded = isUsageTrackingExcluded();
  if (deleted && deletionStatus === 'idle') return null;

  return (
    <footer className="funnel-consent">
      {!deleted && (
        <details>
          <summary>Ayudanos a mejorar Pausa Mía</summary>
          {excluded ? (
            <p className="field-hint">
              Las estadísticas están desactivadas según las preferencias de tu
              navegador.
            </p>
          ) : (
            <label className="checkbox-option" htmlFor="consent-anonymous-usage">
              <input
                id="consent-anonymous-usage"
                type="checkbox"
                checked={productFunnel.isConsented()}
                onChange={(event) => productFunnel.setConsent(event.target.checked)}
                aria-describedby="consent-anonymous-usage-hint"
              />
              <span>Compartir estadísticas de uso de esta meditación (opcional)</span>
            </label>
          )}
          <p className="field-hint" id="consent-anonymous-usage-hint">
            Mostramos en estadísticas los últimos 30 días: qué pasos completaste y desde
            qué tipo de enlace llegaste y cuánto tardó en prepararse el guion, usando un
            código temporal. Nunca enviamos tus respuestas, diario, guion, audio ni
            datos de cuenta. Podés retirar el permiso y pedir borrar los recorridos de
            esta pestaña. La meditación funciona igual si no aceptás.
          </p>
          {excluded && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => productFunnel.setConsent(false)}
            >
              Borrar estadísticas de esta pestaña
            </button>
          )}
        </details>
      )}
      {deletionStatus === 'pending' && (
        <p role="status">Estamos confirmando el borrado de las estadísticas.</p>
      )}
      {deletionStatus === 'done' && (
        <p role="status">Se confirmó el borrado de las estadísticas de esta pestaña.</p>
      )}
      {deletionStatus === 'failed' && (
        <div role="alert">
          <p>
            No pudimos confirmar el borrado de las estadísticas. Conectate a internet y
            reintentá antes de cerrar esta pestaña.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => productFunnel.retryDeletion()}
          >
            Reintentar borrado
          </button>
        </div>
      )}
    </footer>
  );
}
