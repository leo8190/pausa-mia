import type { SessionApi } from '../hooks/useSession';
import type {
  Duration,
  Experience,
  Intention,
  MeditationStyle,
  Moment,
  PerceivedState,
  VoiceVariant,
} from '../types';
import { DeleteSessionButton, StepLayout } from './StepLayout';
import { getPracticeConflicts, getPracticeSummary } from '../lib/practiceCoherence';

export function CheckInStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { checkIn } = sessionApi.session;
  const conflicts = checkIn.style ? getPracticeConflicts(checkIn) : [];
  const practiceSummary = getPracticeSummary(checkIn);

  return (
    <StepLayout
      title="Check-in breve"
      lead="Cada dato se usa solo para personalizar tu pausa. Podés omitir lo que no quieras compartir."
      actions={
        <>
          <form
            className="start-now-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!conflicts.length) sessionApi.startNow();
            }}
          >
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!sessionApi.isCheckInComplete || conflicts.length > 0}
              aria-describedby={
                conflicts.length
                  ? 'practice-conflicts'
                  : sessionApi.isCheckInComplete
                    ? 'start-now-hint'
                    : 'checkin-incomplete-hint'
              }
            >
              Empezar ahora
            </button>
          </form>
          {sessionApi.isCheckInComplete ? (
            <p id="start-now-hint" className="field-hint">
              Empezás con la duración y la voz que elegiste. Podés leer el guion en
              reproducción.
            </p>
          ) : (
            <p id="checkin-incomplete-hint" className="field-hint">
              Completá momento, estado, intención, experiencia y estilo para seguir.
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!sessionApi.isCheckInComplete || conflicts.length > 0}
            aria-describedby={conflicts.length ? 'practice-conflicts' : undefined}
            onClick={() => sessionApi.setStep('context')}
          >
            Personalizar contexto y resumen
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sessionApi.setStep('consent')}
          >
            Volver
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <div className="field">
        <label htmlFor="name">Nombre o apodo (opcional)</label>
        <input
          id="name"
          type="text"
          autoComplete="nickname"
          value={checkIn.name}
          onChange={(e) => sessionApi.updateCheckIn({ name: e.target.value })}
          maxLength={50}
          placeholder="Cómo querés que te nombremos en el guion"
        />
        <p className="field-hint">
          Se usa para personalizar la bienvenida, si lo compartís.
        </p>
      </div>

      <fieldset className="field">
        <legend>Momento del día</legend>
        <div className="radio-group">
          {(
            [
              ['ahora', 'Ahora, en este momento'],
              ['antes-de-dormir', 'Antes de dormir'],
              ['al-despertar', 'Al despertar'],
              ['pausa-laboral', 'Pausa laboral'],
            ] as [Moment, string][]
          ).map(([value, label]) => (
            <label className="radio-option" htmlFor={`moment-${value}`} key={value}>
              <input
                type="radio"
                id={`moment-${value}`}
                name="moment"
                value={value}
                checked={checkIn.moment === value}
                onChange={() => sessionApi.updateCheckIn({ moment: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="recentSituation">Situación reciente (opcional)</label>
        <textarea
          id="recentSituation"
          value={checkIn.recentSituation}
          onChange={(e) =>
            sessionApi.updateCheckIn({ recentSituation: e.target.value })
          }
          maxLength={600}
          placeholder="Algo que pasó hoy o esta semana, sin necesidad de detalles íntimos"
        />
        <p className="field-hint">
          Se usa una referencia breve y segura en el guion, sin leer el texto
          literalmente entre comillas. Máximo 600 caracteres.
        </p>
      </div>

      <fieldset className="field">
        <legend>Estado percibido</legend>
        <div className="radio-group">
          {(
            [
              ['tranquilo', 'Tranquilo'],
              ['acelerado', 'Acelerado'],
              ['disperso', 'Disperso'],
              ['cansado', 'Cansado'],
              ['sensible', 'Sensible'],
              ['otro', 'Otro'],
            ] as [PerceivedState, string][]
          ).map(([value, label]) => (
            <label className="radio-option" htmlFor={`state-${value}`} key={value}>
              <input
                type="radio"
                id={`state-${value}`}
                name="perceivedState"
                value={value}
                checked={checkIn.perceivedState === value}
                onChange={() => sessionApi.updateCheckIn({ perceivedState: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {checkIn.perceivedState === 'otro' && (
          <div className="field field--tight">
            <label className="sr-only" htmlFor="perceived-state-other">
              Descripción del estado percibido
            </label>
            <input
              id="perceived-state-other"
              type="text"
              value={checkIn.perceivedStateOther}
              onChange={(e) =>
                sessionApi.updateCheckIn({ perceivedStateOther: e.target.value })
              }
              placeholder="Describí brevemente"
              maxLength={100}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>Intención de esta pausa</legend>
        <p className="field-hint">
          Qué querés acompañar hoy. No es la técnica que vamos a usar.
        </p>
        <div className="radio-group">
          {(
            [
              ['calmar-ritmo', 'Calmar el ritmo'],
              ['concentrarse', 'Concentrarse'],
              ['descansar', 'Descansar'],
              ['aceptar-emocion', 'Aceptar una emoción'],
              ['volver-al-cuerpo', 'Volver al cuerpo'],
            ] as [Intention, string][]
          ).map(([value, label]) => (
            <label className="radio-option" htmlFor={`intention-${value}`} key={value}>
              <input
                type="radio"
                id={`intention-${value}`}
                name="intention"
                value={value}
                checked={checkIn.intention === value}
                onChange={() => sessionApi.updateCheckIn({ intention: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Experiencia con meditación</legend>
        <div className="radio-group">
          {(
            [
              ['primera-vez', 'Primera vez'],
              ['basica', 'Experiencia básica'],
              ['habitual', 'Práctica habitual'],
            ] as [Experience, string][]
          ).map(([value, label]) => (
            <label className="radio-option" htmlFor={`experience-${value}`} key={value}>
              <input
                type="radio"
                id={`experience-${value}`}
                name="experience"
                value={value}
                checked={checkIn.experience === value}
                onChange={() => sessionApi.updateCheckIn({ experience: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Estilo de práctica</legend>
        <p className="field-hint">
          Cómo te vamos a guiar. Por ejemplo, recorrer el cuerpo puede ayudarte tanto a
          descansar como a reunir la atención.
        </p>
        <div className="radio-group">
          {(
            [
              ['respiracion-natural', 'Respiración natural'],
              ['recorrido-corporal', 'Recorrido corporal'],
              ['atencion-abierta', 'Atención abierta'],
              ['autocompasion', 'Autocompasión'],
            ] as [MeditationStyle, string][]
          ).map(([value, label]) => (
            <label className="radio-option" htmlFor={`style-${value}`} key={value}>
              <input
                type="radio"
                id={`style-${value}`}
                name="style"
                value={value}
                checked={checkIn.style === value}
                onChange={() => sessionApi.updateCheckIn({ style: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {practiceSummary && (
        <p className="info-box" aria-live="polite">
          Tu pausa: {practiceSummary}
        </p>
      )}

      <div className="field">
        <label htmlFor="avoidTopics">Temas o palabras a evitar (opcional)</label>
        <input
          id="avoidTopics"
          type="text"
          value={checkIn.avoidTopics}
          onChange={(e) => sessionApi.updateCheckIn({ avoidTopics: e.target.value })}
          maxLength={200}
          placeholder="Palabras separadas por comas"
        />
        <p className="field-hint">
          Evitaremos esas referencias sin dejar frases incompletas. Si se cruzan con la
          práctica elegida, te avisamos.
        </p>
        {conflicts.length > 0 && (
          <div id="practice-conflicts" role="alert">
            {conflicts.map((conflict) => (
              <p key={conflict}>{conflict}</p>
            ))}
          </div>
        )}
      </div>

      <fieldset className="field">
        <legend>Duración</legend>
        <div className="radio-group">
          {([3, 5, 10] as Duration[]).map((value) => (
            <label className="radio-option" htmlFor={`duration-${value}`} key={value}>
              <input
                type="radio"
                id={`duration-${value}`}
                name="duration"
                value={value}
                checked={checkIn.duration === value}
                onChange={() => sessionApi.updateCheckIn({ duration: value })}
              />
              <span>{value} minutos</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Tu voz preferida</legend>
        <div className="radio-group">
          {(
            [
              ['es-AR', 'Español argentino'],
              ['es-neutro', 'Español neutro'],
            ] as [VoiceVariant, string][]
          ).map(([value, label]) => (
            <label className="radio-option" htmlFor={`voice-${value}`} key={value}>
              <input
                type="radio"
                id={`voice-${value}`}
                name="voiceVariant"
                value={value}
                checked={checkIn.voiceVariant === value}
                onChange={() => sessionApi.updateCheckIn({ voiceVariant: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">
          Elegí el acento que preferís. Te guiaremos despacio, con pausas para
          acompañarte. La voz neutra depende de las voces disponibles en tu dispositivo.
          Si la voz argentina necesita internet, te pediremos permiso antes de enviar el
          guion.
        </p>
      </fieldset>
    </StepLayout>
  );
}
