import { useId, useMemo, useState } from 'react';
import {
  copyDeviceCompatibilityDiagnostic,
  detectDeviceCompatibility,
  verdictClassName,
  verdictLabel,
  type DeviceCompatibilityReport,
} from '../lib/deviceCompatibility';

type CopyFeedback = 'idle' | 'copied' | 'unavailable' | 'failed';

/**
 * Panel de compatibilidad por dispositivo (sin red). Complementa el panel de
 * motores: muestra APIs booleanas y si el endpoint remoto está configurado,
 * sin afirmar que el servidor funcione.
 */
export function DeviceCompatibilityPanel({
  report: reportProp,
}: {
  /** Permite inyectar un informe en pruebas; en UI se detecta al montar. */
  report?: DeviceCompatibilityReport;
} = {}) {
  const headingId = useId();
  const liveId = useId();
  const report = useMemo(() => reportProp ?? detectDeviceCompatibility(), [reportProp]);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>('idle');

  async function handleCopy(): Promise<void> {
    const result = await copyDeviceCompatibilityDiagnostic(report);
    if (result.ok) {
      setCopyFeedback('copied');
      return;
    }
    setCopyFeedback(result.reason === 'unavailable' ? 'unavailable' : 'failed');
  }

  const liveMessage =
    copyFeedback === 'copied'
      ? 'Diagnóstico técnico copiado al portapapeles.'
      : copyFeedback === 'unavailable'
        ? 'No se pudo copiar: el portapapeles no está disponible en este navegador.'
        : copyFeedback === 'failed'
          ? 'No se pudo copiar el diagnóstico. Probá de nuevo o copiá el texto manualmente.'
          : '';

  return (
    <section
      className="device-compat-section voice-engine-section"
      aria-labelledby={headingId}
    >
      <h4 id={headingId}>Compatibilidad de este dispositivo</h4>
      <p className="field-hint">
        Chequeos locales, sin red. Sirven para saber si la voz argentina puede usar
        Piper local, Web Speech o la ruta remota opt-in. No prueban que un servidor
        remoto funcione.
      </p>
      <ul className="voice-engine-list" role="list">
        {report.checks.map((check) => (
          <li className="voice-engine-item" key={check.id}>
            <span
              className={`voice-engine-badge device-compat-badge ${verdictClassName(check.verdict)}`}
            >
              {verdictLabel(check.verdict)}
            </span>
            <span className="voice-engine-body">
              <strong>{check.label}</strong>
              <p className="field-hint">{check.detail}</p>
            </span>
          </li>
        ))}
      </ul>
      <div className="device-compat-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void handleCopy();
          }}
          aria-describedby={liveId}
        >
          Copiar diagnóstico
        </button>
        <p id={liveId} className="field-hint" role="status" aria-live="polite">
          {liveMessage ||
            'Copia sólo capacidades técnicas (APIs y si el endpoint está configurado), sin guion, diario ni perfil.'}
        </p>
      </div>
    </section>
  );
}
