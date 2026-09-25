import { useEffect } from 'react';
import { PRICE_OPTIONS, type PriceOption } from '../types';
import type { SessionApi } from '../hooks/useSession';
import { reportSessionComplete } from '../lib/visitorPing';
import { DeleteSessionButton, StepLayout } from './StepLayout';
import { BetaComments } from './BetaComments';

export function FeedbackStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { rating, selectedPrice, wouldRepeat } = sessionApi.session;

  // Llegó al cierre del flujo = usó la sesión (no bounce ni wipe-only).
  useEffect(() => {
    reportSessionComplete();
  }, []);

  return (
    <StepLayout
      title="¿Cómo te sentís ahora?"
      lead="Si querés, contanos cómo fue tu pausa."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sessionApi.resetToWelcome()}
          >
            Nueva sesión
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <div className="field">
        <label id="rating-label" htmlFor="rating-1">
          ¿Cómo fue esta pausa? (1 a 5)
        </label>
        <div className="rating-group" role="group" aria-labelledby="rating-label">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              id={`rating-${n}`}
              className={`rating-btn${rating === n ? ' selected' : ''}`}
              onClick={() => sessionApi.setRating(n)}
              aria-label={`${n} de 5`}
              aria-pressed={rating === n}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>¿Te gustaría repetir esta experiencia?</label>
        <div
          className="step-actions-row"
          role="group"
          aria-label="¿Te gustaría repetir esta experiencia?"
        >
          <button
            type="button"
            className={`btn choice-btn${wouldRepeat === true ? ' selected' : ''}`}
            onClick={() => sessionApi.setWouldRepeat(true)}
            aria-pressed={wouldRepeat === true}
          >
            Sí
          </button>
          <button
            type="button"
            className={`btn choice-btn${wouldRepeat === false ? ' selected' : ''}`}
            onClick={() => sessionApi.setWouldRepeat(false)}
            aria-pressed={wouldRepeat === false}
          >
            No
          </button>
        </div>
      </div>

      <BetaComments />

      <details className="collapsible-details">
        <summary>Ayudanos a pensar futuras opciones</summary>
        <fieldset className="field">
          <legend>¿Cuál opción elegirías?</legend>
          <p className="field-hint">Es una encuesta opcional. No se cobra nada.</p>
          <div className="price-options">
            {(Object.keys(PRICE_OPTIONS) as PriceOption[]).map((key) => {
              const opt = PRICE_OPTIONS[key];
              return (
                <label
                  key={key}
                  className={`price-option${selectedPrice === key ? ' selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="price"
                    checked={selectedPrice === key}
                    onChange={() => sessionApi.setSelectedPrice(key)}
                  />
                  <span className="price-option-body">
                    <span className="price-amount">{opt.amount}</span>
                    <span className="price-label"> — {opt.label}</span>
                    <span className="field-hint">{opt.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </details>
    </StepLayout>
  );
}
