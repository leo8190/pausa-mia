import { useSyncExternalStore } from 'react';
import { anonymousCounter, type AnonymousCounter } from '../lib/anonymousCounter';

/** Mientras el permiso está dado, permite retirarlo desde cualquier pantalla. */
export function AnonymousCounterNotice({
  hidden = false,
  counter = anonymousCounter,
}: {
  hidden?: boolean;
  counter?: AnonymousCounter;
}) {
  useSyncExternalStore(counter.subscribe, counter.revision, () => 0);
  if (hidden || !counter.isEnabled() || !counter.isConsented()) return null;

  return (
    <footer className="funnel-consent counter-notice">
      <p className="field-hint">
        Estás sumando tus meditaciones al contador anónimo.{' '}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => counter.setConsent(false)}
        >
          Dejar de contar
        </button>
      </p>
    </footer>
  );
}
