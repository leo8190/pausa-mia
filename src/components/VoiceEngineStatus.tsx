import { useEffect, useState } from 'react';
import { getVoiceEngineStatuses, type VoiceEngineStatus } from '../lib/voiceEngine';

function statusBadgeLabel(status: VoiceEngineStatus): string {
  if (status.available) return 'Disponible';
  if (status.id === 'remote-wav-es-ar' && status.configured && status.supported) {
    return 'Opt-in';
  }
  if (status.configured && status.supported) return 'Sin verificar';
  return 'No disponible';
}

function statusBadgeClass(status: VoiceEngineStatus): string {
  if (status.available) return 'is-available';
  if (status.configured && status.supported) return 'is-configured';
  return 'is-unavailable';
}

/**
 * Muestra honestamente qué motores de voz existen y si están disponibles en
 * este dispositivo/navegador concreto. Nunca afirma que un motor funciona
 * cuando no pudo verificarse. El remoto configurado se muestra como motor
 * propio (opt-in), sin fingir una verificación por red.
 */
export function VoiceEngineStatusPanel({
  refreshKey,
}: {
  /** Cambiar este valor (por ejemplo, el estado del reproductor neuronal) fuerza a
   * releer el estado real, para reflejar una verificación recién ocurrida. */
  refreshKey?: string | number;
} = {}) {
  const [statuses, setStatuses] = useState<VoiceEngineStatus[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVoiceEngineStatuses().then((result) => {
      if (!cancelled) setStatuses(result);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!statuses) return null;

  return (
    <section className="voice-engine-section" aria-label="Motores de voz disponibles">
      <h4>Motores de voz en este dispositivo</h4>
      <ul className="voice-engine-list">
        {statuses.map((status) => (
          <li className="voice-engine-item" key={status.id}>
            <span className={`voice-engine-badge ${statusBadgeClass(status)}`}>
              {statusBadgeLabel(status)}
            </span>
            <span className="voice-engine-body">
              <strong>{status.name}</strong>
              <p className="field-hint">{status.description}</p>
              <p className="field-hint">{status.reason}</p>
            </span>
          </li>
        ))}
      </ul>
      <p className="field-hint">
        La variante argentina/neutra que elijas arriba se aplica con el mejor motor
        disponible en este dispositivo. Si no hay una voz es-AR real, te lo avisamos
        antes de reproducir en vez de etiquetar otra voz como argentina.
      </p>
    </section>
  );
}
