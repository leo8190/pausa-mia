import { useState } from 'react';
import type { SessionApi } from '../hooks/useSession';

interface StepLayoutProps {
  title: string;
  lead?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function StepLayout({ title, lead, children, actions }: StepLayoutProps) {
  return (
    <div className="step-container">
      <div className="step-card">
        <h2>{title}</h2>
        {lead && <p className="step-lead">{lead}</p>}
        {children}
        {actions && <div className="step-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function DeleteSessionButton({ sessionApi }: { sessionApi: SessionApi }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="delete-confirm">
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
      className="btn btn-danger"
      onClick={() => setConfirming(true)}
    >
      Borrar esta sesión
    </button>
  );
}
