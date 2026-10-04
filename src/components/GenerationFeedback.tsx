import type { SessionApi } from '../hooks/useSession';

export function GenerationFeedback({ sessionApi }: { sessionApi: SessionApi }) {
  if (sessionApi.isGenerating) {
    return (
      <p className="field-hint" role="status">
        Estamos preparando tu meditación. Podés volver o salir si lo necesitás.
      </p>
    );
  }
  if (sessionApi.generationError) {
    return (
      <p className="field-error" role="alert">
        {sessionApi.generationError}
      </p>
    );
  }
  return null;
}
