import { useEffect, useState } from 'react';
import { useSpeechPlayer } from '../hooks/useSpeechPlayer';
import { useArgentineVoicePlayer } from '../hooks/useArgentineVoicePlayer';
import type { SessionApi } from '../hooks/useSession';
import {
  checkNeuralEngineBrowserSupport,
  ES_AR_VOICE_APPROX_SIZE_MB,
} from '../lib/voiceEngine';
import { isRemoteArgentineTtsConfigured } from '../lib/remoteVoiceService';
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
  // Ruta remota opcional: nunca automática; requiere consentimiento visible.
  const [useRemoteArgentine, setUseRemoteArgentine] = useState(false);
  const [remoteConsent, setRemoteConsent] = useState(false);
  const neuralBrowserSupported = checkNeuralEngineBrowserSupport();
  const remoteConfigured = isRemoteArgentineTtsConfigured();

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

  const argentineMode = useRemoteArgentine ? 'remote' : 'local';
  const {
    state: neuralState,
    prepare: prepareNeural,
    play: playNeural,
    pause: pauseNeural,
    resume: resumeNeural,
    stop: stopNeural,
    restart: restartNeural,
    mountNativeAudioElement,
  } = useArgentineVoicePlayer(argentineMode);

  const useNeuralEngine = wantsArgentineNeural && !useDeviceFallback;

  useEffect(() => {
    if (script && voicesReady) {
      // Auto-start not required; user clicks play
    }
  }, [script, voicesReady]);

  useEffect(() => {
    // Al cambiar de guion o de variante, se descarta cualquier confirmación
    // previa de fallback o remoto: cada sesión vuelve a pedirla si corresponde.
    setUseDeviceFallback(false);
    setUseRemoteArgentine(false);
    setRemoteConsent(false);
  }, [script, checkIn.voiceVariant]);

  useEffect(() => {
    if (useRemoteArgentine && neuralState.status === 'idle') {
      void prepareNeural();
    }
  }, [useRemoteArgentine, neuralState.status, prepareNeural]);

  if (!script) return null;

  if (useNeuralEngine) {
    const isPreparing = neuralState.status === 'preparing';
    const isReady = neuralState.status === 'ready';
    const isPlaying = neuralState.status === 'playing';
    const isPaused = neuralState.status === 'paused';
    const isStoppedAfterPlay = neuralState.status === 'stopped';
    const needsNativePlay = neuralState.status === 'needs-native-play';
    const hasError = neuralState.status === 'error';
    const canPlayback =
      isReady || isPlaying || isPaused || isStoppedAfterPlay || needsNativePlay;
    const progressPct =
      neuralState.progress && neuralState.progress.total > 0
        ? Math.min(
            100,
            Math.round(
              (neuralState.progress.loaded / neuralState.progress.total) * 100,
            ),
          )
        : null;

    const showRemoteOffer =
      !useRemoteArgentine && (remoteConfigured || !neuralBrowserSupported || hasError);

    return (
      <StepLayout
        title="Reproducción"
        lead={
          useRemoteArgentine
            ? 'Voz argentina remota (WAV servido por tu endpoint). El guion se envía sólo tras tu consentimiento.'
            : 'Voz argentina neuronal real (es_AR-daniela-high), generada en tu navegador.'
        }
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

        {useRemoteArgentine && (
          <div className="fallback-notice" role="status">
            Estás usando la voz argentina remota. Sólo se envía el texto del guion (sin
            diario, perfil ni fuentes).{' '}
            <button
              type="button"
              className="btn btn-secondary btn-inline"
              onClick={() => {
                setUseRemoteArgentine(false);
                setRemoteConsent(false);
              }}
            >
              Volver a la voz local
            </button>
          </div>
        )}

        {!useRemoteArgentine && !neuralBrowserSupported && (
          <div className="fallback-notice" role="alert">
            Este navegador no soporta WebAssembly, Cache Storage, TextDecoder o
            reproducción WAV (HTMLAudioElement), necesarios para la voz argentina
            neuronal local. Podés usar la opción remota (si está configurada), una voz
            del dispositivo (no argentina) o volver a intentarlo en Chrome, Edge, Safari
            o Firefox actualizados.
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

        {!useRemoteArgentine &&
          neuralBrowserSupported &&
          neuralState.status === 'idle' && (
            <div
              className="voice-engine-section"
              role="region"
              aria-label="Preparar voz argentina"
            >
              <p className="field-hint">
                La primera vez descarga el modelo real (aprox.{' '}
                {ES_AR_VOICE_APPROX_SIZE_MB} MB) y lo prueba con una frase corta antes
                de mostrarlo como listo. Quedará en caché local para próximas sesiones.
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

        {!useRemoteArgentine && isPreparing && (
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

        {useRemoteArgentine && isPreparing && (
          <p className="field-hint" role="status">
            Preparando voz argentina remota…
          </p>
        )}

        {hasError && (
          <div className="fallback-notice" role="alert">
            No se pudo preparar o reproducir la voz argentina
            {useRemoteArgentine ? ' remota' : ' neuronal'}: {neuralState.error}
            <div className="player-controls">
              {!useRemoteArgentine && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void prepareNeural()}
                >
                  Reintentar
                </button>
              )}
              {useRemoteArgentine && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void prepareNeural()}
                >
                  Reintentar remoto
                </button>
              )}
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

        {showRemoteOffer && (
          <div
            className="voice-engine-section"
            role="region"
            aria-label="Voz argentina remota opcional"
          >
            <p className="field-hint">
              Alternativa remota (opt-in, no automática): evita descargar el modelo
              local (aprox. {ES_AR_VOICE_APPROX_SIZE_MB} MB) y usa audio WAV estándar.
              Un servidor propio sintetiza el mismo modelo Piper. Nunca se activa sola
              ni cambia el motor en silencio.
            </p>
            {!remoteConfigured ? (
              <p className="fallback-notice" role="status">
                Falta configurar el servicio remoto. Definí{' '}
                <code>VITE_ARGENTINE_TTS_ENDPOINT</code> en tu entorno local (ver README
                y <code>voice-service/</code>) y reiniciá el frontend. Sin ese valor no
                se envía ningún texto.
              </p>
            ) : (
              <>
                <label className="checkbox-option" htmlFor="consent-remote-tts">
                  <input
                    type="checkbox"
                    id="consent-remote-tts"
                    checked={remoteConsent}
                    onChange={(e) => setRemoteConsent(e.target.checked)}
                    aria-describedby="consent-remote-tts-hint"
                  />
                  <span>
                    Acepto enviar sólo el texto del guion al servidor de voz para
                    sintetizarlo. No se envían diario, perfil ni fuentes.
                    <span id="consent-remote-tts-hint" className="field-hint">
                      Esta casilla no está marcada por defecto.
                    </span>
                  </span>
                </label>
                <div className="player-controls">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!remoteConsent}
                    onClick={() => {
                      setUseRemoteArgentine(true);
                    }}
                  >
                    Usar voz argentina remota
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="player-stage">
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
            <div className="player-dock">
              {needsNativePlay && (
                <div
                  className="native-audio-fallback"
                  role="region"
                  aria-label="Reproducción con controles del dispositivo"
                >
                  <p className="field-hint" role="status">
                    Tu navegador bloqueó el inicio automático del audio (política de
                    autoplay). Usá el reproductor nativo o el botón de abajo para
                    iniciar el WAV con un gesto explícito. Pausar, Continuar, Detener y
                    Reiniciar siguen disponibles.
                  </p>
                  <div
                    className="native-audio-host"
                    ref={(host) => {
                      mountNativeAudioElement(host);
                    }}
                  />
                  <div className="player-controls">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={resumeNeural}
                      aria-label="Reproducir con controles del dispositivo"
                    >
                      Reproducir con controles del dispositivo
                    </button>
                  </div>
                </div>
              )}

              <div
                className="player-controls"
                role="group"
                aria-label={
                  useRemoteArgentine
                    ? 'Controles de reproducción de voz argentina remota'
                    : 'Controles de reproducción de voz argentina'
                }
              >
                {!isPlaying && !isPaused && !needsNativePlay && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => playNeural(script.segments)}
                    aria-label={
                      useRemoteArgentine
                        ? 'Reproducir voz argentina remota'
                        : 'Reproducir voz argentina'
                    }
                  >
                    {useRemoteArgentine
                      ? 'Reproducir voz argentina remota'
                      : 'Reproducir voz argentina'}
                  </button>
                )}
                {(isPlaying || needsNativePlay) && (
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
                {(isPlaying || isPaused || needsNativePlay) && (
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

              <p
                className={`player-status${isPlaying ? ' player-status--playing' : ''}${isReady && !isPlaying && !isPaused && !isStoppedAfterPlay && !needsNativePlay ? ' player-status--ready' : ''}`}
                role="status"
              >
                Estado: {isReady && 'Listo'}
                {isPlaying &&
                  `Reproduciendo segmento ${neuralState.currentSegmentIndex + 1} de ${script.segments.length}`}
                {isPaused && 'Pausado'}
                {isStoppedAfterPlay && 'Detenido'}
                {needsNativePlay &&
                  `Audio listo — usá el control nativo (segmento ${neuralState.currentSegmentIndex + 1} de ${script.segments.length})`}
              </p>
            </div>
          )}
        </div>
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

      <div className="player-stage">
        <div
          className="script-preview"
          role="region"
          aria-label="Guion en reproducción"
        >
          {script.segments.map((seg, i) => (
            <p
              className={`script-segment${playerState.currentSegmentIndex === i && isPlaying ? ' active' : ''}`}
              key={i}
            >
              {seg.text}
            </p>
          ))}
        </div>

        <div className="player-dock">
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
            className={`player-status${isPlaying ? ' player-status--playing' : ''}${playerState.status === 'idle' ? ' player-status--ready' : ''}`}
            role="status"
          >
            Estado: {playerState.status === 'idle' && 'Listo'}
            {playerState.status === 'playing' &&
              `Reproduciendo segmento ${playerState.currentSegmentIndex + 1} de ${script.segments.length}`}
            {playerState.status === 'paused' && 'Pausado'}
            {playerState.status === 'stopped' && 'Detenido'}
          </p>
        </div>
      </div>
    </StepLayout>
  );
}
