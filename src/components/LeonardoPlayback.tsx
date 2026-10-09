import { useEffect, useState } from 'react';
import type { SessionApi } from '../hooks/useSession';
import { useLeonardoVoicePlayer } from '../hooks/useLeonardoVoicePlayer';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function LeonardoPlayback({ sessionApi }: { sessionApi: SessionApi }) {
  const [consent, setConsent] = useState(false);
  const { state, nativeReady, native, play, pause, resume, stop, mountAudio } =
    useLeonardoVoicePlayer();
  const script = sessionApi.session.script;
  const clearAutoStartPlayback = sessionApi.clearAutoStartPlayback;
  useEffect(() => {
    clearAutoStartPlayback();
  }, [clearAutoStartPlayback]);
  if (!script) return null;
  const playing = state.status === 'playing',
    paused = state.status === 'paused',
    preparing = state.status === 'preparing';
  return (
    <StepLayout
      title="Tu pausa con la voz de Leonardo"
      lead="Una voz generada con IA, a un ritmo tranquilo."
      actions={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              stop();
              sessionApi.setStep('feedback');
            }}
          >
            Terminar mi pausa
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              stop();
              sessionApi.setStep('checkin');
            }}
          >
            Editar mi pausa
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <label className="consent-option">
        <input
          type="checkbox"
          checked={consent}
          disabled={preparing || playing || paused}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!e.target.checked) stop();
          }}
        />{' '}
        Permito enviar el guion de esta sesión a HeyGen para crear el audio con la voz
        de Leonardo. Puede incluir los detalles personales que elegí. Este permiso no se
        guarda.
      </label>
      {state.error && (
        <p role="alert" className="fallback-notice">
          {state.error}
        </p>
      )}
      <details className="collapsible-details">
        <summary>Leer la meditación</summary>
        {script.segments.map((part, i) => (
          <p
            key={i}
            className={
              state.currentSegmentIndex === i && playing
                ? 'script-segment active'
                : 'script-segment'
            }
          >
            {part.text}
          </p>
        ))}
      </details>
      <div className="player-controls">
        {!playing && !paused && !preparing && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!consent || !nativeReady}
            onClick={() =>
              state.status === 'needs-native-play'
                ? resume()
                : play(script.segments, consent)
            }
          >
            Reproducir
          </button>
        )}
        {playing && (
          <button type="button" className="btn btn-secondary" onClick={pause}>
            Pausar
          </button>
        )}
        {paused && (
          <button type="button" className="btn btn-primary" onClick={resume}>
            Continuar
          </button>
        )}
        {(preparing || playing || paused) && (
          <button type="button" className="btn btn-secondary" onClick={stop}>
            Detener
          </button>
        )}
      </div>
      <p role="status">
        {preparing
          ? `Preparando tu voz: ${state.completed} de ${script.segments.length} partes`
          : playing
            ? 'Disfrutá tu pausa'
            : paused
              ? 'Pausado'
              : state.status === 'needs-native-play'
                ? 'Tu audio está listo. Tocá reproducir para empezar.'
                : state.status === 'stopped' &&
                    state.currentSegmentIndex >= script.segments.length
                  ? 'Tu pausa terminó'
                  : 'Podés leer el guion antes de escucharlo.'}
      </p>
      {!native && <div ref={mountAudio} aria-label="Audio con la voz de Leonardo" />}
    </StepLayout>
  );
}
