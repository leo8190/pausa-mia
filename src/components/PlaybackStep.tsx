import { useEffect } from 'react';
import { useSpeechPlayer } from '../hooks/useSpeechPlayer';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function PlaybackStep({ sessionApi }: { sessionApi: SessionApi }) {
  const script = sessionApi.session.script;
  const { checkIn } = sessionApi.session;
  const {
    playerState,
    fallbackMessage,
    voicesReady,
    play,
    pause,
    resume,
    stop,
    restart,
  } = useSpeechPlayer(checkIn.voiceVariant);

  useEffect(() => {
    if (script && voicesReady) {
      // Auto-start not required; user clicks play
    }
  }, [script, voicesReady]);

  if (!script) return null;

  const isPlaying = playerState.status === 'playing';
  const isPaused = playerState.status === 'paused';

  return (
    <StepLayout
      title="Reproducción"
      lead="Audio generado con la voz disponible en tu dispositivo (Web Speech API)."
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sessionApi.setStep('feedback')}
          >
            Continuar al cierre
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              stop();
              sessionApi.setStep('review');
            }}
          >
            Volver al guion
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      {fallbackMessage && (
        <div className="fallback-notice" role="status">
          {fallbackMessage}
        </div>
      )}

      {!voicesReady && (
        <p className="field-hint">
          No se detectaron voces de síntesis. Puedes leer el guion en la pantalla
          anterior.
        </p>
      )}

      <div className="script-preview" role="region" aria-label="Guion en reproducción">
        {script.segments.map((seg, i) => (
          <p
            className={`script-segment${playerState.currentSegmentIndex === i && isPlaying ? ' active' : ''}`}
            key={i}
          >
            {seg.text}
          </p>
        ))}
      </div>

      <div
        className="player-controls"
        role="group"
        aria-label="Controles de reproducción"
      >
        {!isPlaying && !isPaused && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => play(script.segments)}
            aria-label="Reproducir"
          >
            Reproducir
          </button>
        )}
        {isPlaying && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={pause}
            aria-label="Pausar"
          >
            Pausar
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={resume}
            aria-label="Continuar"
          >
            Continuar
          </button>
        )}
        {(isPlaying || isPaused) && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={stop}
            aria-label="Detener"
          >
            Detener
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            stop();
            restart();
          }}
          aria-label="Reiniciar"
        >
          Reiniciar
        </button>
      </div>

      <p className="player-status" role="status">
        Estado: {playerState.status === 'idle' && 'Listo'}
        {playerState.status === 'playing' &&
          `Reproduciendo segmento ${playerState.currentSegmentIndex + 1} de ${script.segments.length}`}
        {playerState.status === 'paused' && 'Pausado'}
        {playerState.status === 'stopped' && 'Detenido'}
      </p>
    </StepLayout>
  );
}
