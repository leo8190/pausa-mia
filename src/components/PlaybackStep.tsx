import { useEffect, useState } from 'react';
import { useSpeechPlayer } from '../hooks/useSpeechPlayer';
import { useArgentineVoicePlayer } from '../hooks/useArgentineVoicePlayer';
import type { SessionApi } from '../hooks/useSession';
import {
  checkNeuralEngineBrowserSupport,
  ES_AR_VOICE_APPROX_SIZE_MB,
} from '../lib/voiceEngine';
import { DeleteSessionButton, StepLayout } from './StepLayout';
import { VoiceEngineStatusPanel } from './VoiceEngineStatus';

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function PlaybackStep({ sessionApi }: { sessionApi: SessionApi }) {
  const script = sessionApi.session.script;
  const { checkIn } = sessionApi.session;
  const wantsArgentineNeural = checkIn.voiceVariant === 'es-AR';

  // Si la persona confirma explícitamente que quiere usar una voz del
  // dispositivo (no argentina) tras un fallo de la voz neuronal, o si eligió
  // español neutro, se usa el motor Web Speech de siempre.
  const [useDeviceFallback, setUseDeviceFallback] = useState(false);
  const neuralBrowserSupported = checkNeuralEngineBrowserSupport();

  const {
    playerState,
    fallbackMessage,
    voicesReady,
    play: playWebSpeech,
    pause: pauseWebSpeech,
    resume: resumeWebSpeech,
    stop: stopWebSpeech,
    restart: restartWebSpeech,
  } = useSpeechPlayer(checkIn.voiceVariant);

  const {
    state: neuralState,
    prepare: prepareNeural,
    play: playNeural,
    pause: pauseNeural,
    resume: resumeNeural,
    stop: stopNeural,
    restart: restartNeural,
  } = useArgentineVoicePlayer();

  const useNeuralEngine = wantsArgentineNeural && !useDeviceFallback;

  useEffect(() => {
    if (script && voicesReady) {
      // Auto-start not required; user clicks play
    }
  }, [script, voicesReady]);

  useEffect(() => {
    // Al cambiar de guion o de variante, se descarta cualquier confirmación
    // previa de fallback: cada sesión de reproducción vuelve a pedirla si
    // corresponde, en vez de recordar silenciosamente una decisión pasada.
    setUseDeviceFallback(false);
  }, [script, checkIn.voiceVariant]);

  if (!script) return null;

  if (useNeuralEngine) {
    const isPreparing = neuralState.status === 'preparing';
    const isReady = neuralState.status === 'ready';
    const isPlaying = neuralState.status === 'playing';
    const isPaused = neuralState.status === 'paused';
    const isStoppedAfterPlay = neuralState.status === 'stopped';
    const hasError = neuralState.status === 'error';
    const canPlayback = isReady || isPlaying || isPaused || isStoppedAfterPlay;
    const progressPct =
      neuralState.progress && neuralState.progress.total > 0
        ? Math.min(
            100,
            Math.round(
              (neuralState.progress.loaded / neuralState.progress.total) * 100,
            ),
          )
        : null;

    return (
      <StepLayout
        title="Reproducción"
        lead="Voz argentina neuronal real (es_AR-daniela-high), generada en tu navegador."
        cardClassName={isPlaying ? 'step-card--active' : undefined}
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
                stopNeural();
                sessionApi.setStep('review');
              }}
            >
              Volver al guion
            </button>
            <DeleteSessionButton sessionApi={sessionApi} />
          </>
        }
      >
        <VoiceEngineStatusPanel refreshKey={neuralState.status} />

        {!neuralBrowserSupported && (
          <div className="fallback-notice" role="alert">
            Este navegador no soporta WebAssembly, AudioContext o Cache Storage,
            necesarios para la voz argentina neuronal. Podés usar una voz del
            dispositivo (no argentina) o volver a intentarlo en Chrome, Edge, Safari o
            Firefox actualizados.
            <div className="player-controls">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUseDeviceFallback(true)}
              >
                Usar voz del dispositivo (no es argentina)
              </button>
            </div>
          </div>
        )}

        {neuralBrowserSupported && neuralState.status === 'idle' && (
          <div
            className="voice-engine-section"
            role="region"
            aria-label="Preparar voz argentina"
          >
            <p className="field-hint">
              La primera vez descarga el modelo real (aprox.{' '}
              {ES_AR_VOICE_APPROX_SIZE_MB} MB) y lo prueba con una frase corta antes de
              mostrarlo como listo. Quedará en caché local para próximas sesiones.
            </p>
            <div className="player-controls">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void prepareNeural()}
              >
                Preparar voz argentina
              </button>
            </div>
          </div>
        )}

        {isPreparing && (
          <div className="voice-engine-section" role="status" aria-live="polite">
            <p className="field-hint">
              Preparando voz argentina
              {neuralState.progress && neuralState.progress.total > 0
                ? ` — ${formatMb(neuralState.progress.loaded)} / ${formatMb(neuralState.progress.total)} MB${
                    progressPct !== null ? ` (${progressPct}%)` : ''
                  }`
                : '…'}
            </p>
            <progress
              className="voice-engine-progress"
              value={progressPct ?? undefined}
              max={100}
              aria-label="Progreso de descarga de la voz argentina"
            />
          </div>
        )}

        {hasError && (
          <div className="fallback-notice" role="alert">
            No se pudo preparar o reproducir la voz argentina neuronal:{' '}
            {neuralState.error}
            <div className="player-controls">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void prepareNeural()}
              >
                Reintentar
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUseDeviceFallback(true)}
              >
                Usar voz del dispositivo (no es argentina)
              </button>
            </div>
          </div>
        )}

        <div
          className="script-preview"
          role="region"
          aria-label="Guion en reproducción"
        >
          {script.segments.map((seg, i) => (
            <p
              className={`script-segment${neuralState.currentSegmentIndex === i && isPlaying ? ' active' : ''}`}
              key={i}
            >
              {seg.text}
            </p>
          ))}
        </div>

        {canPlayback && (
          <div
            className="player-controls"
            role="group"
            aria-label="Controles de reproducción de voz argentina"
          >
            {!isPlaying && !isPaused && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => playNeural(script.segments)}
                aria-label="Reproducir voz argentina"
              >
                Reproducir voz argentina
              </button>
            )}
            {isPlaying && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={pauseNeural}
                aria-label="Pausar"
              >
                Pausar
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={resumeNeural}
                aria-label="Continuar"
              >
                Continuar
              </button>
            )}
            {(isPlaying || isPaused) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={stopNeural}
                aria-label="Detener"
              >
                Detener
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={restartNeural}
              aria-label="Reiniciar"
            >
              Reiniciar
            </button>
          </div>
        )}

        {canPlayback && (
          <p
            className={`player-status${isPlaying ? ' player-status--playing' : ''}`}
            role="status"
          >
            Estado: {isReady && 'Listo'}
            {isPlaying &&
              `Reproduciendo segmento ${neuralState.currentSegmentIndex + 1} de ${script.segments.length}`}
            {isPaused && 'Pausado'}
            {isStoppedAfterPlay && 'Detenido'}
          </p>
        )}
      </StepLayout>
    );
  }

  const isPlaying = playerState.status === 'playing';
  const isPaused = playerState.status === 'paused';

  return (
    <StepLayout
      title="Reproducción"
      lead="Audio generado con la voz disponible en tu dispositivo (Web Speech API)."
      cardClassName={isPlaying ? 'step-card--active' : undefined}
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
              stopWebSpeech();
              sessionApi.setStep('review');
            }}
          >
            Volver al guion
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      {wantsArgentineNeural && useDeviceFallback && (
        <div className="fallback-notice" role="status">
          Estás usando una voz del dispositivo, no la voz argentina neuronal.{' '}
          <button
            type="button"
            className="btn btn-secondary btn-inline"
            onClick={() => setUseDeviceFallback(false)}
          >
            Volver a intentar la voz argentina
          </button>
        </div>
      )}

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

      <VoiceEngineStatusPanel />

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
            onClick={() => playWebSpeech(script.segments)}
            aria-label="Reproducir"
          >
            Reproducir
          </button>
        )}
        {isPlaying && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={pauseWebSpeech}
            aria-label="Pausar"
          >
            Pausar
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={resumeWebSpeech}
            aria-label="Continuar"
          >
            Continuar
          </button>
        )}
        {(isPlaying || isPaused) && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={stopWebSpeech}
            aria-label="Detener"
          >
            Detener
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            stopWebSpeech();
            restartWebSpeech();
          }}
          aria-label="Reiniciar"
        >
          Reiniciar
        </button>
      </div>

      <p
        className={`player-status${isPlaying ? ' player-status--playing' : ''}`}
        role="status"
      >
        Estado: {playerState.status === 'idle' && 'Listo'}
        {playerState.status === 'playing' &&
          `Reproduciendo segmento ${playerState.currentSegmentIndex + 1} de ${script.segments.length}`}
        {playerState.status === 'paused' && 'Pausado'}
        {playerState.status === 'stopped' && 'Detenido'}
      </p>
    </StepLayout>
  );
}
