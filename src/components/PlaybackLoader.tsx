import { useEffect, useState, type ComponentType } from 'react';
import type { SessionApi } from '../hooks/useSession';
import { loadPlaybackStep } from '../lib/playbackChunk';
import { DeleteSessionButton, StepLayout } from './StepLayout';

type Player = ComponentType<{ sessionApi: SessionApi }>;

/** Keep the session outside the download so a network failure cannot erase it. */
export function PlaybackLoader({ sessionApi }: { sessionApi: SessionApi }) {
  const [Player, setPlayer] = useState<Player | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void loadPlaybackStep().then(
      (module) => {
        if (active) setPlayer(() => module.PlaybackStep);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  if (Player) return <Player sessionApi={sessionApi} />;

  return (
    <StepLayout
      title={failed ? 'Tu meditación sigue acá' : 'Preparando reproducción'}
      lead={
        failed
          ? 'No pudimos cargar el reproductor. Revisá tu conexión y volvé a intentar, o leé tu meditación.'
          : 'Cargando el reproductor… Mientras tanto, podés leer tu meditación.'
      }
      cardClassName="step-card--playback"
      actions={
        <>
          {failed && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setFailed(false);
                setAttempt((previous) => previous + 1);
              }}
            >
              Reintentar cargar el audio
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sessionApi.setStep('review')}
          >
            Leer mi meditación
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => sessionApi.setStep('checkin')}
          >
            Editar mi pausa
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <p role={failed ? 'alert' : 'status'}>
        {failed
          ? 'Tu guion y tus respuestas se conservan en esta sesión.'
          : 'No hace falta volver a empezar.'}
      </p>
    </StepLayout>
  );
}
