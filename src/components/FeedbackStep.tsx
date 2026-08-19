import { PRICE_OPTIONS, type PriceOption } from '../types';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function FeedbackStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { rating, selectedPrice, wouldRepeat } = sessionApi.session;

  return (
    <StepLayout
      title="Cierre de sesión"
      lead="Tu opinión ayuda a mejorar. No hay cobro real en esta fase."
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

      <fieldset className="field">
        <legend>¿Cuál opción elegirías? (hipótesis, sin cobro)</legend>
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
        <p className="field-hint">
          Son hipótesis de precio. No se cobra ni se promete acceso hasta autorización
          explícita.
        </p>
      </fieldset>

      <p className="field-hint">
        Las fuentes que podés agregar (perfil, calendario, diario, redes) se encuentran
        en el paso "Contexto adicional". Las conexiones en línea equivalentes siguen
        desactivadas hasta que exista una configuración real.
      </p>
    </StepLayout>
  );
}
