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

export function CheckInStep({ sessionApi }: { sessionApi: SessionApi }) {
  const { checkIn } = sessionApi.session;

  return (
    <StepLayout
      title="Check-in breve"
      lead="Cada dato se usa solo para personalizar tu pausa. Podés omitir lo que no quieras compartir."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!sessionApi.isCheckInComplete}
            onClick={() => sessionApi.setStep('context')}
          >
            Ver contexto y resumen
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
            <div className="radio-option" key={value}>
              <input
                type="radio"
                id={`moment-${value}`}
                name="moment"
                value={value}
                checked={checkIn.moment === value}
                onChange={() => sessionApi.updateCheckIn({ moment: value })}
              />
              <label htmlFor={`moment-${value}`}>{label}</label>
            </div>
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
            <div className="radio-option" key={value}>
              <input
                type="radio"
                id={`state-${value}`}
                name="perceivedState"
                value={value}
                checked={checkIn.perceivedState === value}
                onChange={() => sessionApi.updateCheckIn({ perceivedState: value })}
              />
              <label htmlFor={`state-${value}`}>{label}</label>
            </div>
          ))}
        </div>
        {checkIn.perceivedState === 'otro' && (
          <input
            type="text"
            value={checkIn.perceivedStateOther}
            onChange={(e) =>
              sessionApi.updateCheckIn({ perceivedStateOther: e.target.value })
            }
            placeholder="Describe brevemente"
            maxLength={100}
            aria-label="Descripción del estado percibido"
          />
        )}
      </fieldset>

      <fieldset className="field">
        <legend>Intención de esta pausa</legend>
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
            <div className="radio-option" key={value}>
              <input
                type="radio"
                id={`intention-${value}`}
                name="intention"
                value={value}
                checked={checkIn.intention === value}
                onChange={() => sessionApi.updateCheckIn({ intention: value })}
              />
              <label htmlFor={`intention-${value}`}>{label}</label>
            </div>
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
            <div className="radio-option" key={value}>
              <input
                type="radio"
                id={`experience-${value}`}
                name="experience"
                value={value}
                checked={checkIn.experience === value}
                onChange={() => sessionApi.updateCheckIn({ experience: value })}
              />
              <label htmlFor={`experience-${value}`}>{label}</label>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Estilo de práctica</legend>
        <div className="radio-group">
          {(
            [
              ['respiracion-natural', 'Respiración natural'],
              ['recorrido-corporal', 'Recorrido corporal'],
              ['atencion-abierta', 'Atención abierta'],
              ['autocompasion', 'Autocompasión'],
            ] as [MeditationStyle, string][]
          ).map(([value, label]) => (
            <div className="radio-option" key={value}>
              <input
                type="radio"
                id={`style-${value}`}
                name="style"
                value={value}
                checked={checkIn.style === value}
                onChange={() => sessionApi.updateCheckIn({ style: value })}
              />
              <label htmlFor={`style-${value}`}>{label}</label>
            </div>
          ))}
        </div>
      </fieldset>

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
        <p className="field-hint">Se omitirán del guion si aparecen.</p>
      </div>

      <fieldset className="field">
        <legend>Duración</legend>
        <div className="radio-group">
          {([3, 5, 10] as Duration[]).map((value) => (
            <div className="radio-option" key={value}>
              <input
                type="radio"
                id={`duration-${value}`}
                name="duration"
                value={value}
                checked={checkIn.duration === value}
                onChange={() => sessionApi.updateCheckIn({ duration: value })}
              />
              <label htmlFor={`duration-${value}`}>{value} minutos</label>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Variante de español</legend>
        <div className="radio-group">
          {(
            [
              ['es-AR', 'Español argentino'],
              ['es-neutro', 'Español neutro'],
            ] as [VoiceVariant, string][]
          ).map(([value, label]) => (
            <div className="radio-option" key={value}>
              <input
                type="radio"
                id={`voice-${value}`}
                name="voiceVariant"
                value={value}
                checked={checkIn.voiceVariant === value}
                onChange={() => sessionApi.updateCheckIn({ voiceVariant: value })}
              />
              <label htmlFor={`voice-${value}`}>{label}</label>
            </div>
          ))}
        </div>
      </fieldset>
    </StepLayout>
  );
}
