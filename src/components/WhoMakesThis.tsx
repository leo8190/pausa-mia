import { useId } from 'react';

const CONTACT_EMAIL = 'leonardo23322@gmail.com';
const SUBJECT = 'Pausa Mía — contacto';
const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}`;

export function WhoMakesThis() {
  const id = useId();

  return (
    <section className="who-makes-this" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="who-makes-this-title">
        Quién hace esto
      </h3>
      <p className="who-makes-this-mission">
        Pausa Mía es un proyecto indie en beta: meditación guiada en español, en
        tu navegador. No somos una corporación ni un servicio de terapia — solo
        un espacio local para hacer una pausa a tu medida.
      </p>
      <p className="who-makes-this-contact">
        <a
          className="btn btn-ghost btn-small who-makes-this-link"
          href={CONTACT_MAILTO}
        >
          Escribir al equipo
        </a>
        <span className="who-makes-this-address field-hint">{CONTACT_EMAIL}</span>
      </p>
    </section>
  );
}
