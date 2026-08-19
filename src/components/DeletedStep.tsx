import type { SessionApi } from '../hooks/useSession';
import { StepLayout } from './StepLayout';

export function DeletedStep({ sessionApi }: { sessionApi: SessionApi }) {
  const empty = sessionApi.isSessionEmpty;

  return (
    <StepLayout
      title="Sesión borrada"
      lead={
        empty
          ? 'Todos los campos de sesión quedaron vacíos.'
          : 'Revisar estado de sesión.'
      }
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => sessionApi.resetToWelcome()}
        >
          Volver al inicio
        </button>
      }
    >
      <p>
        Los datos de esta sesión fueron eliminados de memoria y del almacenamiento local
        de preferencias. Al recargar la página, no quedará ningún rastro de la sesión.
      </p>
      {!empty && (
        <p className="field-hint">
          Nota: algunos campos podrían no haberse limpiado por completo. Recargá la
          página para dejar la sesión vacía.
        </p>
      )}
    </StepLayout>
  );
}
