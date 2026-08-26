import { useId, useState } from 'react';
import type { SessionApi } from '../hooks/useSession';

interface StepLayoutProps {
  title: string;
  lead?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** Contenido opcional debajo de las acciones (p. ej. avisos legales largos). */
  afterActions?: React.ReactNode;
  hero?: React.ReactNode;
  /** Clase adicional para destacar la tarjeta, por ejemplo durante la reproducción activa. */
  cardClassName?: string;
}

export function StepLayout({
  title,
  lead,
  children,
  actions,
  afterActions,
  hero,
  cardClassName,
}: StepLayoutProps) {
  const titleId = useId();

  return (
    <div className="step-container">
      <section
        className={`step-card${cardClassName ? ` ${cardClassName}` : ''}`}
        aria-labelledby={titleId}
      >
        {hero}
        <h2 id={titleId}>{title}</h2>
        {lead && <p className="step-lead">{lead}</p>}
        <div className="step-body">{children}</div>
        {actions && <div className="step-actions">{actions}</div>}
        {afterActions && <div className="step-after-actions">{afterActions}</div>}
      </section>
    </div>
  );
}

export function DeleteSessionButton({ sessionApi }: { sessionApi: SessionApi }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div
        className="delete-confirm"
        role="alertdialog"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-desc"
      >
        <p id="delete-confirm-title">¿Borrar todos los datos de esta sesión?</p>
        <p id="delete-confirm-desc" className="delete-confirm-desc">
          Se vaciará el check-in, el diario y el guion, se borrarán las preferencias
          locales y se detendrá cualquier audio en curso. Vas a ver una confirmación
          explícita del borrado.
        </p>
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
