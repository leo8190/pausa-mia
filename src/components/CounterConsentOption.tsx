import { useSyncExternalStore } from 'react';
import { anonymousCounter, type AnonymousCounter } from '../lib/anonymousCounter';
import { isUsageTrackingExcluded } from '../lib/usagePrivacy';

/** Permiso opcional y desmarcado para sumar la práctica al contador anónimo. */
export function CounterConsentOption({
  counter = anonymousCounter,
  idPrefix = 'consent',
}: {
  counter?: AnonymousCounter;
  idPrefix?: string;
}) {
  useSyncExternalStore(counter.subscribe, counter.revision, () => 0);
  if (!counter.isEnabled() || isUsageTrackingExcluded()) return null;
  const id = `${idPrefix}-anonymous-counter`;

  return (
    <label className="checkbox-option" htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={counter.isConsented()}
        onChange={(event) => counter.setConsent(event.target.checked)}
        aria-describedby={`${id}-hint`}
      />
      <span>
        Sumar mis meditaciones al contador anónimo (opcional).{' '}
        <span id={`${id}-hint`} className="field-hint">
          Nos ayuda a saber cuánta gente usa Pausa Mía. Sumamos 1 a un total en un
          servicio externo (Abacus) cuando empezás, creás, escuchás o terminás una
          meditación, y anotamos el tipo de enlace por el que llegaste. No enviamos tus
          respuestas, guion ni audio. Ese servicio recibe datos técnicos de conexión,
          como la IP. Podés desmarcarlo cuando quieras.
        </span>
      </span>
    </label>
  );
}
