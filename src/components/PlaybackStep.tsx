import { useEffect, useState } from 'react';
import { useSpeechPlayer } from '../hooks/useSpeechPlayer';
import {
  useArgentineVoicePlayer,
  argentineWavDownloadName,
} from '../hooks/useArgentineVoicePlayer';
import type { SessionApi } from '../hooks/useSession';
import {
  checkNeuralEngineBrowserSupport,
  ES_AR_VOICE_APPROX_SIZE_MB,
} from '../lib/voiceEngine';
import { isRemoteArgentineTtsConfigured } from '../lib/remoteVoiceService';
import { DeleteSessionButton, StepLayout } from './StepLayout';
import { TechnicalVoiceDetails } from './TechnicalVoiceDetails';

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
    canSpeak,
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
  const neuralAudioUrl = neuralState.nativeAudioUrl;

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

    // Remota (si aplica) antes que la voz no argentina; nunca automática.
    const showRemoteOffer =
      !useRemoteArgentine && (remoteConfigured || !neuralBrowserSupported || hasError);
    const showDeviceLastResort =
      !useRemoteArgentine && (!neuralBrowserSupported || hasError);
    const deviceAfterRemote = showRemoteOffer && showDeviceLastResort;
    const deviceInline = showDeviceLastResort && !showRemoteOffer;

    const deviceFallbackButton = (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setUseDeviceFallback(true)}
      >
        Usar voz del dispositivo (no es argentina)
      </button>
    );

    return (
      <StepLayout
        title="Reproducción"
        lead={
          useRemoteArgentine
            ? 'Voz argentina remota. El texto del guion se envía sólo si aceptás.'
            : 'Voz argentina, generada en tu navegador.'
        }
        cardClassName={`step-card--playback${isPlaying ? ' step-card--active' : ''}`}
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
            Este navegador no puede usar la voz argentina en tu dispositivo. Si hay una
            opción remota, aparece abajo antes que cualquier voz que no sea argentina.
            {deviceInline && (
              <div className="player-controls">{deviceFallbackButton}</div>
            )}
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
              {deviceInline && deviceFallbackButton}
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
              Podés escuchar la voz argentina sin descargar el modelo en este
              dispositivo (aprox. {ES_AR_VOICE_APPROX_SIZE_MB} MB). El audio se genera
              en un servidor propio y no se activa solo: hace falta tu consentimiento.
            </p>
            <p className="field-hint">
              Compatibilidad real: en Safari/iOS y algunos Android el inicio automático
              puede bloquearse hasta tocar reproducir; en Chrome y Edge suele iniciar
              sin pasos extra. Si hay bloqueo, mostramos controles nativos HTMLAudio
              para continuar manualmente.
            </p>
            {!remoteConfigured ? (
              <p className="fallback-notice" role="status">
                Esta opción remota no está disponible en esta copia de la app. Falta
                configurar el servicio remoto. Sin esa configuración no se envía ningún
                texto.
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
            {deviceAfterRemote && (
              <div className="player-controls">{deviceFallbackButton}</div>
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

          {needsNativePlay && (
            <div
              className="native-audio-fallback"
              role="region"
              aria-label="Reproducción con controles del dispositivo"
            >
              <p className="field-hint" role="status">
                Tu navegador bloqueó el inicio automático del audio. Usá el reproductor
                nativo o el botón de abajo para iniciar el WAV. Pausar, Continuar,
                Detener y Reiniciar siguen disponibles.
              </p>
              <p className="field-hint">
                Esto puede pasar en Safari (iOS/macOS), algunos Android y WebViews; no
                implica falla del guion ni del servidor. En Chrome/Edge de escritorio
                suele suceder menos, pero no se puede garantizar universalidad.
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
              {neuralAudioUrl && (
                <div
                  className="native-audio-actions"
                  aria-label="Opciones del archivo de audio"
                >
                  <a
                    className="btn btn-secondary btn-small"
                    href={neuralAudioUrl}
                    download={argentineWavDownloadName(neuralState.currentSegmentIndex)}
                  >
                    Descargar WAV
                  </a>
                  <a
                    className="btn btn-ghost btn-small"
                    href={neuralAudioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir audio
                  </a>
                </div>
              )}
            </div>
          )}

          {canPlayback && (
            <div
              className="player-dock"
              role="region"
              aria-label="Reproductor de la sesión"
            >
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
              {neuralAudioUrl && !needsNativePlay && (
                <div
                  className="native-audio-actions"
                  aria-label="Guardar el segmento actual"
                >
                  <a
                    className="btn btn-secondary btn-small"
                    href={neuralAudioUrl}
                    download={argentineWavDownloadName(neuralState.currentSegmentIndex)}
                  >
                    Descargar segmento actual
                  </a>
                  <a
                    className="btn btn-ghost btn-small"
                    href={neuralAudioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir audio
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <TechnicalVoiceDetails refreshKey={neuralState.status} />
      </StepLayout>
    );
  }

  const isPlaying = playerState.status === 'playing';
  const isPaused = playerState.status === 'paused';

  return (
    <StepLayout
      title="Reproducción"
      lead="Audio generado con la voz disponible en tu dispositivo (Web Speech API)."
      cardClassName={`step-card--playback${isPlaying ? ' step-card--active' : ''}`}
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

      {!canSpeak && (
        <div className="fallback-notice" role="status">
          {!voicesReady
            ? 'No hay síntesis de voz usable en este navegador. Podés leer el guion abajo o volver a la pantalla de revisión.'
            : 'La síntesis de voz no está lista todavía.'}
          <div className="player-controls">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                stopWebSpeech();
                sessionApi.setStep('review');
              }}
            >
              Leer el guion
            </button>
          </div>
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
              className={`script-segment${playerState.currentSegmentIndex === i && isPlaying ? ' active' : ''}`}
              key={i}
            >
              {seg.text}
            </p>
          ))}
        </div>

        <div
          className="player-dock"
          role="region"
          aria-label="Reproductor de la sesión"
        >
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
                disabled={!canSpeak}
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
              disabled={!canSpeak}
              aria-label="Reiniciar"
            >
              Reiniciar
            </button>
          </div>

          <p
            className={`player-status${isPlaying ? ' player-status--playing' : ''}${playerState.status === 'idle' ? ' player-status--ready' : ''}`}
            role="status"
          >
            Estado: {!canSpeak && 'Lectura en pantalla (sin audio del dispositivo)'}
            {canSpeak && playerState.status === 'idle' && 'Listo'}
            {canSpeak &&
              playerState.status === 'playing' &&
              `Reproduciendo segmento ${playerState.currentSegmentIndex + 1} de ${script.segments.length}`}
            {canSpeak && playerState.status === 'paused' && 'Pausado'}
            {canSpeak && playerState.status === 'stopped' && 'Detenido'}
          </p>
        </div>
      </div>

      <TechnicalVoiceDetails />
    </StepLayout>
  );
}
