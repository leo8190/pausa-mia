import { useState } from 'react';
import type { SessionApi } from '../hooks/useSession';

interface StepLayoutProps {
  title: string;
  lead?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** Clase adicional para destacar la tarjeta, por ejemplo durante la reproducción activa. */
  cardClassName?: string;
}

export function StepLayout({
  title,
  lead,
  children,
  actions,
  cardClassName,
}: StepLayoutProps) {
  return (
    <div className="step-container">
      <div className={`step-card${cardClassName ? ` ${cardClassName}` : ''}`}>
        <h2>{title}</h2>
        {lead && <p className="step-lead">{lead}</p>}
        <div className="step-body">{children}</div>
        {actions && <div className="step-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function DeleteSessionButton({ sessionApi }: { sessionApi: SessionApi }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="delete-confirm" role="alertdialog" aria-label="Confirmar borrado">
        <p>¿Borrar todos los datos de esta sesión?</p>
        <div className="step-actions-row">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              sessionApi.deleteSession();
              setConfirming(false);
            }}
          >
            Sí, borrar sesión
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-danger btn-ghost"
      onClick={() => setConfirming(true)}
    >
      Borrar esta sesión
    </button>
  );
}
