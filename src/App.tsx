import { useEffect } from 'react';
import { useSession } from './hooks/useSession';
import { WelcomeStep } from './components/WelcomeStep';
import { ConsentStep } from './components/ConsentStep';
import { CheckInStep } from './components/CheckInStep';
import { ContextStep } from './components/ContextStep';
import { SummaryStep } from './components/SummaryStep';
import { AiConsentStep } from './components/AiConsentStep';
import { SafetyStep } from './components/SafetyStep';
import { ReviewStep } from './components/ReviewStep';
import { FeedbackStep } from './components/FeedbackStep';
import { DeletedStep } from './components/DeletedStep';
import { ProductFunnelPreview } from './components/ProductFunnelPreview';
import { ProductFunnelConsent } from './components/ProductFunnelConsent';
import { AnonymousCounterNotice } from './components/AnonymousCounterNotice';
import { StepProgress } from './components/StepProgress';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { prefetchPlaybackStep } from './lib/playbackChunk';
import { PlaybackLoader } from './components/PlaybackLoader';

function App() {
  const sessionApi = useSession();
  const { step } = sessionApi.session;
  useDocumentTitle(step);

  // Prefetch del chunk de voz antes de llegar a reproducción (no bloquea el UI).
  useEffect(() => {
    if (
      step === 'checkin' ||
      step === 'context' ||
      step === 'summary' ||
      step === 'review' ||
      step === 'ai-consent'
    ) {
      prefetchPlaybackStep();
    }
  }, [step]);

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
        <StepProgress step={step} />
      </header>
      <main className="app-main" id="main-content">
        <ProductFunnelPreview />
        {step === 'welcome' && <WelcomeStep sessionApi={sessionApi} />}
        {step === 'consent' && <ConsentStep sessionApi={sessionApi} />}
        {step === 'checkin' && <CheckInStep sessionApi={sessionApi} />}
        {step === 'context' && <ContextStep sessionApi={sessionApi} />}
        {step === 'summary' && <SummaryStep sessionApi={sessionApi} />}
        {step === 'ai-consent' && <AiConsentStep sessionApi={sessionApi} />}
        {step === 'safety' && <SafetyStep sessionApi={sessionApi} />}
        {step === 'review' && <ReviewStep sessionApi={sessionApi} />}
        {step === 'playback' && <PlaybackLoader sessionApi={sessionApi} />}
        {step === 'feedback' && <FeedbackStep sessionApi={sessionApi} />}
        {step === 'deleted' && <DeletedStep sessionApi={sessionApi} />}
      </main>
      <ProductFunnelConsent deleted={step === 'deleted'} />
      <AnonymousCounterNotice hidden={step === 'deleted'} />
    </div>
  );
}

export default App;
