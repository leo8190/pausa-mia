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
      <header className="app-header">
        <h1>Meditación a Medida</h1>
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
