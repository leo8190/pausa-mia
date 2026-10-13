import { useSyncExternalStore } from 'react';
import { anonymousCounter } from '../lib/anonymousCounter';
import { isUsageTrackingExcluded } from '../lib/usagePrivacy';

/** Propósito visible del contador anónimo y opción de no contar desde esta pestaña. */
export function AnonymousCounterNotice({ hidden = false }: { hidden?: boolean }) {
  useSyncExternalStore(anonymousCounter.subscribe, anonymousCounter.revision, () => 0);
  if (hidden || !anonymousCounter.isEnabled()) return null;
  const excluded = isUsageTrackingExcluded();

  return (
    <footer className="funnel-consent counter-notice">
      <details>
        <summary>Contador anónimo</summary>
        <p className="field-hint" id="anonymous-counter-hint">
          Para saber si Pausa Mía sirve, sumamos 1 a un total cuando empezás, creás,
          escuchás o terminás una meditación, junto con el tipo de enlace por el que
          llegaste. El total se guarda en un contador externo (Abacus). Sin cookies, sin
          identificadores y sin tus respuestas, diario, guion ni audio.
        </p>
        {excluded ? (
          <p className="field-hint">
            Tu navegador pidió no medir el uso: no contamos nada desde acá.
          </p>
        ) : (
          <label className="checkbox-option" htmlFor="anonymous-counter-optout">
            <input
              id="anonymous-counter-optout"
              type="checkbox"
              checked={anonymousCounter.isOptedOut()}
              onChange={(event) => anonymousCounter.setOptOut(event.target.checked)}
              aria-describedby="anonymous-counter-hint"
            />
            <span>No contar mis meditaciones desde esta pestaña</span>
          </label>
        )}
      </details>
    </footer>
  );
}
