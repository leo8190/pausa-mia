import { useEffect, useId, useRef, useState } from 'react';
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
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [title]);

  return (
    <div className="step-container">
      <section
        className={`step-card${cardClassName ? ` ${cardClassName}` : ''}`}
        aria-labelledby={titleId}
      >
        {hero}
        <h2 id={titleId} ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const confirmId = useId();
  const titleId = `${confirmId}-title`;
  const descId = `${confirmId}-desc`;

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (wasConfirming.current) {
      triggerRef.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  if (confirming) {
    return (
      <div
        className="delete-confirm"
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setConfirming(false);
          }
        }}
      >
        <p id={titleId}>¿Borrar todos los datos de esta sesión?</p>
        <p id={descId} className="delete-confirm-desc">
          Se borrarán tus respuestas, el diario, el guion y las preferencias de este
          dispositivo. El audio se detendrá. Si compartiste estadísticas de este
          recorrido, pediremos borrarlas. Tu cuenta no se elimina.
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
            ref={cancelRef}
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
      ref={triggerRef}
      onClick={() => setConfirming(true)}
    >
      Borrar esta sesión
    </button>
  );
}
