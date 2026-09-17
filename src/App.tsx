import { useSession } from './hooks/useSession';
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
