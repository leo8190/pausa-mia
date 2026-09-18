import { useEffect, useRef, useState } from 'react';
import { useSpeechPlayer } from '../hooks/useSpeechPlayer';
import { useArgentineVoicePlayer } from '../hooks/useArgentineVoicePlayer';
import type { SessionApi } from '../hooks/useSession';
import {
  checkNeuralEngineBrowserSupport,
  checkRemoteWavPlaybackSupport,
} from '../lib/voiceEngine';
import { isRemoteArgentineTtsConfigured } from '../lib/remoteVoiceService';
import { reportSessionComplete } from '../lib/visitorPing';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function PlaybackStep({ sessionApi }: { sessionApi: SessionApi }) {
  const script = sessionApi.session.script;
  const { checkIn, autoStartPlayback } = sessionApi.session;
  const clearAutoStartPlayback = sessionApi.clearAutoStartPlayback;
  const wantsArgentineNeural = checkIn.voiceVariant === 'es-AR';

  // Si la persona confirma explícitamente que quiere usar una voz del
  // dispositivo (no argentina) tras un fallo de la voz neuronal, o si eligió
  // español neutro, se usa el motor Web Speech de siempre.
  const [useDeviceFallback, setUseDeviceFallback] = useState(false);
  // Ruta remota opcional: nunca automática; requiere consentimiento visible.
  const [useRemoteArgentine, setUseRemoteArgentine] = useState(false);
  const [remoteConsent, setRemoteConsent] = useState(false);
  const neuralBrowserSupported = checkNeuralEngineBrowserSupport();
  const remoteWavPlaybackSupported = checkRemoteWavPlaybackSupport();
  const remoteConfigured = isRemoteArgentineTtsConfigured();
  /** Evita un segundo play() si React Strict Mode remonta el efecto. */
  const autoStartPlayAttemptedRef = useRef(false);

  const {
    playerState,
    fallbackMessage,
    playbackError,
    voicesReady,
    canSpeak,
    speechSupported,
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
    // Al cambiar de guion o de variante, se descarta cualquier confirmación
    // previa de fallback o remoto: cada sesión vuelve a pedirla si corresponde.
    setUseDeviceFallback(false);
    setUseRemoteArgentine(false);
    setRemoteConsent(false);
    autoStartPlayAttemptedRef.current = false;
  }, [script, checkIn.voiceVariant]);

  useEffect(() => {
    if (useRemoteArgentine && neuralState.status === 'idle') {
      void prepareNeural();
    }
  }, [useRemoteArgentine, neuralState.status, prepareNeural]);

  /**
   * Atajo Empezar ahora: el clic ya es gesto de usuario. Preparar (si hace falta)
   * e intentar play una sola vez sobre el HTMLAudioElement de sesión (#19).
   * Si el navegador bloquea autoplay → controles nativos; nunca volver a Welcome.
   * Remoto sigue opt-in (consentimiento); no se activa solo.
   */
  useEffect(() => {
    if (!script || !autoStartPlayback) return;
    if (autoStartPlayAttemptedRef.current) return;

    if (useNeuralEngine) {
      if (!neuralBrowserSupported) {
        clearAutoStartPlayback();
        return;
      }
      if (neuralState.status === 'idle') {
        void prepareNeural(script.segments[0]?.text);
        return;
      }
      if (neuralState.status === 'preparing') return;
      if (neuralState.status === 'ready') {
        autoStartPlayAttemptedRef.current = true;
        clearAutoStartPlayback();
        playNeural(script.segments);
        return;
      }
      // playing / paused / stopped / error / needs-native-play: no reintentar.
      clearAutoStartPlayback();
      return;
    }

    if (!speechSupported) {
      clearAutoStartPlayback();
      return;
    }
    if (!voicesReady || !canSpeak) return;

    autoStartPlayAttemptedRef.current = true;
    clearAutoStartPlayback();
    playWebSpeech(script.segments);
  }, [
    script,
    autoStartPlayback,
    useNeuralEngine,
    neuralBrowserSupported,
    neuralState.status,
    prepareNeural,
    playNeural,
    speechSupported,
    voicesReady,
    canSpeak,
    playWebSpeech,
    clearAutoStartPlayback,
  ]);

  // Reproducción natural terminada (último segmento) = sesión usada.
  useEffect(() => {
    if (!script) return;
    const segmentCount = script.segments.length;
    if (segmentCount === 0) return;

    if (useNeuralEngine) {
      if (
        neuralState.status === 'stopped' &&
        neuralState.currentSegmentIndex >= segmentCount
      ) {
        reportSessionComplete();
      }
      return;
    }

    if (
      playerState.status === 'stopped' &&
      playerState.currentSegmentIndex >= segmentCount
    ) {
      reportSessionComplete();
    }
  }, [
    script,
    useNeuralEngine,
    neuralState.status,
    neuralState.currentSegmentIndex,
    playerState.status,
    playerState.currentSegmentIndex,
  ]);

  if (!script) return null;

  if (useNeuralEngine) {
    const isPreparing = neuralState.status === 'preparing';
    const isReady = neuralState.status === 'ready';
    const isPlaying = neuralState.status === 'playing';
    const isPaused = neuralState.status === 'paused';
    const isStoppedAfterPlay = neuralState.status === 'stopped';
    const needsNativePlay = neuralState.status === 'needs-native-play';
    const keepNativeControlsMounted = neuralState.nativeControlsRequired;
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

    // Resolver la voz localmente. Sólo ofrecer ayuda por internet cuando haga
    // falta, sin presentar los motores como una decisión habitual de la sesión.
    const showRemoteOffer =
      !useRemoteArgentine &&
      remoteConfigured &&
      remoteWavPlaybackSupported &&
      (!neuralBrowserSupported || hasError);
    const showDeviceLastResort =
      hasError || (!useRemoteArgentine && !neuralBrowserSupported);
    const canUseDeviceFallback = showDeviceLastResort && canSpeak;
    const hasNoCompatibleAudioPlayer =
      showDeviceLastResort && !showRemoteOffer && !canSpeak;
    const deviceAfterRemote = showRemoteOffer && showDeviceLastResort;
    const deviceInline = showDeviceLastResort && !showRemoteOffer;

    const deviceFallbackButton = (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          stopNeural();
          setUseRemoteArgentine(false);
          setRemoteConsent(false);
          setUseDeviceFallback(true);
        }}
      >
        Escuchar con otra voz en español
      </button>
    );

    return (
      <StepLayout
        title="Reproducción"
        lead="Voz argentina. Tomate este momento a tu ritmo."
        cardClassName={`step-card--playback${isPlaying ? ' step-card--active' : ''}`}
        actions={
          <>
            {canPlayback && !isReady && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => sessionApi.setStep('feedback')}
              >
                Terminar mi pausa
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                stopNeural();
                sessionApi.setStep('checkin');
              }}
            >
              Editar mi pausa
            </button>
            <DeleteSessionButton sessionApi={sessionApi} />
          </>
        }
      >
        {useRemoteArgentine && (
          <details className="collapsible-details">
            <summary>Privacidad del audio</summary>
            <p className="field-hint">
              Autorizaste preparar el audio por internet. Se envía sólo el guion a
              nuestro servicio de voz; puede incluir detalles que compartiste para esta
              meditación. Podés retirar el permiso en cualquier momento.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-inline"
              onClick={() => {
                stopNeural();
                setUseRemoteArgentine(false);
                setRemoteConsent(false);
              }}
            >
              Retirar permiso
            </button>
          </details>
        )}

        {!useRemoteArgentine && !neuralBrowserSupported && (
          <div className="fallback-notice" role="alert">
            La voz argentina no está disponible directamente en este dispositivo.
            {deviceInline && canUseDeviceFallback && (
              <div className="player-controls">{deviceFallbackButton}</div>
            )}
            {hasNoCompatibleAudioPlayer && (
              <p className="field-hint">
                Por ahora no podemos reproducir audio acá. Podés leer el guion en
                pantalla o volver a revisarlo.
              </p>
            )}
          </div>
        )}
        {showRemoteOffer && (
          <div
            className="voice-engine-section"
            role="region"
            aria-label="Ayuda para escuchar la voz argentina"
          >
            <p className="field-hint">
              Podemos preparar la misma voz argentina por internet. Para hacerlo,
              necesitamos enviar el guion a nuestro servicio de voz.
            </p>
            <label className="checkbox-option" htmlFor="consent-remote-tts">
              <input
                type="checkbox"
                id="consent-remote-tts"
                checked={remoteConsent}
                onChange={(e) => setRemoteConsent(e.target.checked)}
                aria-describedby="consent-remote-tts-hint"
              />
              <span>
                Acepto enviar el guion para preparar el audio.
                <span id="consent-remote-tts-hint" className="field-hint">
                  El guion puede incluir detalles personales que compartiste. No se
                  envían tu diario, perfil ni fuentes completos. El permiso vale sólo
                  para esta sesión y podés retirarlo.
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
                Preparar audio por internet
              </button>
            </div>
            {deviceAfterRemote && canUseDeviceFallback && (
              <>
                <p className="field-hint">
                  También podés usar otra voz en español; el acento puede cambiar.
                </p>
                <div className="player-controls">{deviceFallbackButton}</div>
              </>
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
                La primera vez puede tardar un poco y consumir datos. El audio se
                prepara en tu dispositivo.
              </p>
              <div className="player-controls">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void prepareNeural(script.segments[0]?.text)}
                >
                  Preparar audio
                </button>
              </div>
            </div>
          )}

        {!useRemoteArgentine && isPreparing && (
          <div className="voice-engine-section" role="status" aria-live="polite">
            <p className="field-hint">Preparando tu audio…</p>
            <progress
              className="voice-engine-progress"
              value={progressPct ?? undefined}
              max={100}
              aria-label="Preparando tu audio"
            />
          </div>
        )}

        {useRemoteArgentine && isPreparing && (
          <p className="field-hint" role="status">
            Preparando tu audio…
          </p>
        )}

        {hasError && (
          <div className="fallback-notice" role="alert">
            No pudimos preparar o reproducir el audio. Podés volver a intentarlo.
            <div className="player-controls">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void prepareNeural(script.segments[0]?.text)}
              >
                Reintentar
              </button>
              {deviceInline && canUseDeviceFallback && deviceFallbackButton}
              {hasNoCompatibleAudioPlayer && (
                <p className="field-hint">
                  Por ahora no podemos reproducir audio acá. Podés leer el guion en
                  pantalla.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="player-stage">
          <details className="collapsible-details player-script">
            <summary>Leer la meditación</summary>
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
          </details>

          {(needsNativePlay || keepNativeControlsMounted) && (
            <div
              className="native-audio-fallback"
              role="region"
              aria-label="Audio de tu meditación"
            >
              {needsNativePlay && (
                <p className="field-hint" role="status">
                  Tu audio está listo. Tocá reproducir para empezar.
                </p>
              )}
              <div
                className="native-audio-host"
                ref={(host) => {
                  mountNativeAudioElement(host);
                }}
              />
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
                aria-label="Controles de reproducción"
              >
                {!isPlaying && !isPaused && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      needsNativePlay ? resumeNeural() : playNeural(script.segments)
                    }
                    aria-label="Reproducir"
                  >
                    Reproducir
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
                {!isReady && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={restartNeural}
                    aria-label="Reiniciar"
                  >
                    Reiniciar
                  </button>
                )}
              </div>

              <p
                className={`player-status${isPlaying ? ' player-status--playing' : ''}${isReady && !isPlaying && !isPaused && !isStoppedAfterPlay && !needsNativePlay ? ' player-status--ready' : ''}`}
                role="status"
              >
                {isReady && 'Tu audio está listo'}
                {isPlaying && 'Disfrutá tu pausa'}
                {isPaused && 'Pausado'}
                {isStoppedAfterPlay &&
                  (neuralState.currentSegmentIndex >= script.segments.length
                    ? 'Tu pausa terminó'
                    : 'Detenido')}
                {needsNativePlay && 'Tu audio está listo para reproducir'}
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
      lead="Tomate este momento a tu ritmo."
      cardClassName={`step-card--playback${isPlaying ? ' step-card--active' : ''}`}
      actions={
        <>
          {playerState.status !== 'idle' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => sessionApi.setStep('feedback')}
            >
              Terminar mi pausa
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              stopWebSpeech();
              sessionApi.setStep('checkin');
            }}
          >
            Editar mi pausa
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      {wantsArgentineNeural && useDeviceFallback && (
        <div className="fallback-notice" role="status">
          Elegiste otra voz en español. Puede tener un acento diferente.{' '}
          <button
            type="button"
            className="btn btn-secondary btn-inline"
            onClick={() => {
              stopWebSpeech();
              setUseDeviceFallback(false);
            }}
          >
            Volver a intentar la voz argentina
          </button>
        </div>
      )}

      {fallbackMessage && !useDeviceFallback && canSpeak && (
        <div className="fallback-notice" role="status">
          {fallbackMessage}
        </div>
      )}

      {playbackError && (
        <div className="fallback-notice" role="alert">
          {playbackError}
        </div>
      )}

      {!canSpeak && (
        <div className="fallback-notice" role="status">
          {!voicesReady
            ? 'No podemos reproducir audio acá. Podés leer el guion.'
            : 'La voz todavía no está lista. Podés leer el guion mientras tanto.'}
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
        <details className="collapsible-details player-script">
          <summary>Leer la meditación</summary>
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
        </details>

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
            {playerState.status !== 'idle' && (
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
            )}
          </div>

          <p
            className={`player-status${isPlaying ? ' player-status--playing' : ''}${playerState.status === 'idle' ? ' player-status--ready' : ''}`}
            role="status"
          >
            {!canSpeak && 'Guion disponible para leer'}
            {canSpeak && playerState.status === 'idle' && 'Listo'}
            {canSpeak && playerState.status === 'playing' && 'Disfrutá tu pausa'}
            {canSpeak && playerState.status === 'paused' && 'Pausado'}
            {canSpeak &&
              playerState.status === 'stopped' &&
              (playerState.currentSegmentIndex >= script.segments.length
                ? 'Tu pausa terminó'
                : 'Detenido')}
          </p>
        </div>
      </div>
    </StepLayout>
  );
}
