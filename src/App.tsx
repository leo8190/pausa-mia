import { useSession } from './hooks/useSession';
import type { AppStep } from './types';
import { WelcomeStep } from './components/WelcomeStep';
import { ConsentStep } from './components/ConsentStep';
import { CheckInStep } from './components/CheckInStep';
import { ContextStep } from './components/ContextStep';
import { SummaryStep } from './components/SummaryStep';
import { AiConsentStep } from './components/AiConsentStep';
import { SafetyStep } from './components/SafetyStep';
import { ReviewStep } from './components/ReviewStep';
import { PlaybackStep } from './components/PlaybackStep';
import { FeedbackStep } from './components/FeedbackStep';
import { DeletedStep } from './components/DeletedStep';

const MAIN_FLOW: { id: AppStep; label: string }[] = [
  { id: 'welcome', label: 'Bienvenida' },
  { id: 'consent', label: 'Consentimiento' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'context', label: 'Contexto' },
  { id: 'summary', label: 'Resumen' },
  { id: 'review', label: 'Revisión' },
  { id: 'playback', label: 'Reproducción' },
  { id: 'feedback', label: 'Cierre' },
];

/** Pasos que se muestran como parte de un desvío puntual, no del progreso lineal. */
const BRANCH_STEP_LABELS: Partial<Record<AppStep, string>> = {
  'ai-consent': 'Consentimiento para IA (paso adicional)',
  safety: 'Pausa de seguridad',
  deleted: 'Sesión borrada',
};

function getProgress(step: AppStep) {
  const branchLabel = BRANCH_STEP_LABELS[step];
  if (branchLabel) {
    return { label: branchLabel, index: null, total: MAIN_FLOW.length };
  }
  const index = MAIN_FLOW.findIndex((item) => item.id === step);
  if (index === -1) return null;
  return { label: MAIN_FLOW[index].label, index, total: MAIN_FLOW.length };
}

function ProgressIndicator({ step }: { step: AppStep }) {
  const progress = getProgress(step);
  if (!progress) return null;

  const { label, index, total } = progress;
  const isBranch = index === null;
  const current = isBranch ? total : index + 1;
  const percent = Math.round((current / total) * 100);

  return (
    <div className="progress" aria-label="Progreso de la sesión">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={isBranch ? undefined : current}
        aria-valuetext={isBranch ? label : `Paso ${current} de ${total}: ${label}`}
      >
        <div
          className={`progress-fill${isBranch ? ' progress-fill--branch' : ''}`}
          style={{ width: `${isBranch ? 100 : percent}%` }}
        />
      </div>
      <p className="progress-label">
        {isBranch ? 'Paso especial' : `Paso ${current} de ${total} · ${label}`}
      </p>
    </div>
  );
}

function App() {
  const sessionApi = useSession();
  const { step } = sessionApi.session;

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Saltar al contenido principal
      </a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-mark-ring" />
            <span className="brand-mark-core" />
          </span>
          <div className="brand-text">
            <h1 className="brand-title">Pausa Mía</h1>
            <p className="brand-subtitle">Meditación a Medida</p>
          </div>
        </div>
        <ProgressIndicator step={step} />
      </header>
      <main className="app-main" id="main-content">
        {step === 'welcome' && <WelcomeStep sessionApi={sessionApi} />}
        {step === 'consent' && <ConsentStep sessionApi={sessionApi} />}
        {step === 'checkin' && <CheckInStep sessionApi={sessionApi} />}
        {step === 'context' && <ContextStep sessionApi={sessionApi} />}
        {step === 'summary' && <SummaryStep sessionApi={sessionApi} />}
        {step === 'ai-consent' && <AiConsentStep sessionApi={sessionApi} />}
        {step === 'safety' && <SafetyStep sessionApi={sessionApi} />}
        {step === 'review' && <ReviewStep sessionApi={sessionApi} />}
        {step === 'playback' && <PlaybackStep sessionApi={sessionApi} />}
        {step === 'feedback' && <FeedbackStep sessionApi={sessionApi} />}
        {step === 'deleted' && <DeletedStep sessionApi={sessionApi} />}
      </main>
    </div>
  );
}

export default App;
