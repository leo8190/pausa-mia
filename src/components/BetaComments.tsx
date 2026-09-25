import { useId, useRef, useState } from 'react';

const CONTACT_EMAIL = 'leonardo23322@gmail.com';
const SUBJECT = 'Pausa Mía — comentario de la beta';
const BODY = `Mi comentario sobre Pausa Mía:

¿Pude abrir la página?
¿Hasta dónde llegué: página, guion o audio?
¿Qué mejoraría?

No incluyas datos personales, tu diario ni el guion generado.`;
// Deliberately static: never accept or interpolate session/account data here.
const COMMENT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;

export function BetaComments() {
  const id = useId();
  const addressInput = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'manual'>(
    'idle',
  );

  async function copyAddress() {
    setCopyState('copying');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
      addressInput.current?.focus();
      addressInput.current?.select();
    }
  }

  return (
    <section className="beta-comments" aria-labelledby={`${id}-title`}>
      <p className="beta-comments-kicker">Tu opinión es bienvenida · opcional</p>
      <h3 id={`${id}-title`}>¿Qué mejorarías?</h3>
      <p>Contanos si pudiste abrir la página, hasta dónde llegaste y qué cambiarías.</p>
      <p className="beta-comments-privacy">
        No incluyas tu diario, datos personales ni el guion generado.
      </p>
      <a
        className="btn btn-secondary"
        href={COMMENT_MAILTO}
        aria-describedby={`${id}-email-help`}
      >
        Escribir comentario por correo
      </a>
      <p id={`${id}-email-help`} className="field-hint">
        Se abrirá tu aplicación de correo. Podés editar el mensaje antes de enviarlo. El
        equipo verá tu dirección de remitente. Pausa Mía no lo envía por vos.
      </p>
      <div className="beta-comments-copy">
        <label htmlFor={`${id}-address`}>Dirección de contacto</label>
        <input
          ref={addressInput}
          id={`${id}-address`}
          type="text"
          value={CONTACT_EMAIL}
          readOnly
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void copyAddress()}
          disabled={copyState === 'copying'}
        >
          {copyState === 'copying'
            ? 'Copiando dirección…'
            : 'Copiar dirección de contacto'}
        </button>
      </div>
      <p className="field-hint beta-comments-status" role="status" aria-live="polite">
        {copyState === 'copied' &&
          'Dirección copiada. Pegala en tu correo cuando quieras.'}
        {copyState === 'manual' &&
          'No pudimos copiarla automáticamente. Seleccioná la dirección de arriba y copiala manualmente.'}
        {(copyState === 'idle' || copyState === 'copying') &&
          'Si no tenés una aplicación de correo configurada, podés copiar la dirección. Copiar no envía ningún mensaje.'}
      </p>
    </section>
  );
}
