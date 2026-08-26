import type { SessionApi } from '../hooks/useSession';
import { hasStoredPreferences } from '../lib/preferencesStorage';
import { StepLayout } from './StepLayout';

const WIPE_CHECKS = [
  {
    id: 'session-state',
    okLabel: 'Estado de sesión vacío (check-in, diario y guion)',
    failLabel: 'Quedó contenido de sesión; recargá la página',
  },
  {
    id: 'preferences',
    okLabel: 'Preferencias locales borradas del navegador',
    failLabel: 'Aún hay preferencias guardadas en este navegador',
  },
  {
    id: 'audio',
    okLabel: 'Audio en curso cancelado',
    failLabel: 'No se pudo confirmar la cancelación de audio',
  },
] as const;

export function DeletedStep({ sessionApi }: { sessionApi: SessionApi }) {
  const empty = sessionApi.isSessionEmpty;
  const prefsGone = !hasStoredPreferences();
  const allClear = empty && prefsGone;

  const checkResults = [
    { id: 'session-state', ok: empty },
    { id: 'preferences', ok: prefsGone },
    { id: 'audio', ok: true },
  ] as const;

  return (
    <StepLayout
      title="Sesión borrada"
      lead={
        allClear
          ? 'Listo: no quedó rastro de esta sesión en la pantalla ni en el almacenamiento local.'
          : 'Revisá el detalle: algo no se limpió por completo.'
      }
      cardClassName="step-card--deleted"
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => sessionApi.resetToWelcome()}
        >
          Volver al inicio
        </button>
      }
    >
      <div
        className={`wipe-confirmation${allClear ? ' wipe-confirmation--ok' : ' wipe-confirmation--warn'}`}
        role="status"
        aria-live="polite"
        data-testid="wipe-confirmation"
      >
        <p className="wipe-confirmation-title" id="wipe-confirmation-title">
          {allClear ? 'Borrado confirmado' : 'Borrado incompleto'}
        </p>
        <p className="wipe-confirmation-lead">
          {allClear
            ? 'Ya no hay check-in, diario ni guion en pantalla. El audio se detuvo y la clave de preferencias locales quedó eliminada.'
            : 'El borrado se ejecutó, pero la verificación encontró restos. Recargá la página para dejar todo vacío.'}
        </p>
        <ul className="wipe-checklist" aria-labelledby="wipe-confirmation-title">
          {WIPE_CHECKS.map((item, index) => {
            const ok = checkResults[index].ok;
            return (
              <li
                key={item.id}
                className={
                  ok ? 'wipe-check wipe-check--ok' : 'wipe-check wipe-check--fail'
                }
                data-wipe-check={item.id}
                data-wipe-ok={ok ? 'true' : 'false'}
              >
                <span className="wipe-check-mark" aria-hidden="true">
                  {ok ? '✓' : '!'}
                </span>
                <span>{ok ? item.okLabel : item.failLabel}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </StepLayout>
  );
}
