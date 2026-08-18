import {
  ARGENTINA_CRISIS_LINE,
  ARGENTINA_CRISIS_LINE_URL,
  SAFETY_ACTIONS,
  SAFETY_MESSAGE,
} from '../lib/safetyDetector';
import type { SessionApi } from '../hooks/useSession';
import { DeleteSessionButton, StepLayout } from './StepLayout';

export function SafetyStep({ sessionApi }: { sessionApi: SessionApi }) {
  return (
    <StepLayout
      title="Pausa de seguridad"
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              sessionApi.updateCheckIn({
                recentSituation: '',
                perceivedStateOther: '',
                avoidTopics: '',
              });
              sessionApi.setStep('checkin');
            }}
          >
            Borrar texto y volver al check-in
          </button>
          <DeleteSessionButton sessionApi={sessionApi} />
        </>
      }
    >
      <div className="safety-card">
        <h2>Importante</h2>
        <p>{SAFETY_MESSAGE}</p>
        <ul className="safety-actions">
          {SAFETY_ACTIONS.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
        <p>
          Línea nacional de Argentina: <strong>{ARGENTINA_CRISIS_LINE}</strong>{' '}
          (gratuita, confidencial, 24/7).{' '}
          <a href={ARGENTINA_CRISIS_LINE_URL} target="_blank" rel="noopener noreferrer">
            Fuente oficial
          </a>
        </p>
        <p>
          No generamos una meditación cuando el texto sugiere peligro inmediato. Esto no
          es un diagnóstico ni una evaluación de riesgo.
        </p>
      </div>
    </StepLayout>
  );
}
