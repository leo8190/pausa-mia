import { useEffect, useState } from 'react';
import { getVoiceEngineStatuses, type VoiceEngineStatus } from '../lib/voiceEngine';

/**
 * Muestra honestamente qué motores de voz existen y si están disponibles en
 * este dispositivo/navegador concreto. Nunca afirma que un motor funciona
 * cuando no pudo verificarse.
 */
export function VoiceEngineStatusPanel() {
  const [statuses, setStatuses] = useState<VoiceEngineStatus[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVoiceEngineStatuses().then((result) => {
      if (!cancelled) setStatuses(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!statuses) return null;

  return (
    <section className="voice-engine-section" aria-label="Motores de voz disponibles">
      <h4>Motores de voz en este dispositivo</h4>
      <ul className="voice-engine-list">
        {statuses.map((status) => (
          <li className="voice-engine-item" key={status.id}>
            <span
              className={`voice-engine-badge ${status.available ? 'is-available' : 'is-unavailable'}`}
            >
              {status.available ? 'Disponible' : 'No disponible'}
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
