import { useEffect, useState } from 'react';
import { DeviceCompatibilityPanel } from './DeviceCompatibilityPanel';
import { VoiceEngineStatusPanel } from './VoiceEngineStatus';
import { summarizeVoiceAvailability } from '../lib/voiceAvailabilitySummary';
import { getVoiceEngineStatuses } from '../lib/voiceEngine';

/**
 * Resumen humano + paneles técnicos colapsados. Los paneles siguen en el DOM
 * para diagnóstico y para no romper las pruebas existentes.
 */
export function TechnicalVoiceDetails({
  refreshKey,
}: {
  refreshKey?: string | number;
} = {}) {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVoiceEngineStatuses().then((statuses) => {
      if (!cancelled) setSummary(summarizeVoiceAvailability(statuses));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="voice-availability-block">
      {summary && (
        <p className="field-hint voice-availability-summary" role="status">
          {summary}
        </p>
      )}
      <details className="collapsible-details">
        <summary>Información técnica (opcional)</summary>
        <VoiceEngineStatusPanel refreshKey={refreshKey} />
        <DeviceCompatibilityPanel />
      </details>
    </div>
  );
}
