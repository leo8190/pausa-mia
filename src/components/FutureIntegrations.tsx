const FUTURE_INTEGRATIONS = [
  { name: 'Google Perfil', description: 'Preferencias de cuenta (futuro)' },
  { name: 'Google Calendar', description: 'Recordatorios de pausa (futuro)' },
  { name: 'Diario persistente', description: 'Entradas privadas en la nube (futuro)' },
  { name: 'Instagram', description: 'Compartir sesiones (futuro)' },
  { name: 'Facebook', description: 'Compartir sesiones (futuro)' },
  { name: 'X (Twitter)', description: 'Compartir sesiones (futuro)' },
  { name: 'LinkedIn', description: 'Compartir sesiones (futuro)' },
  { name: 'TikTok', description: 'Compartir sesiones (futuro)' },
];

export function FutureIntegrations() {
  return (
    <section className="future-section" aria-label="Integraciones futuras desactivadas">
      <h3>Integraciones futuras (desactivadas)</h3>
      <p className="field-hint">
        Estas funciones no solicitan permisos ni simulan conexiones. Requieren
        consentimiento incremental independiente en fases posteriores. OAuth real sigue
        desactivado.
      </p>
      <ul>
        {FUTURE_INTEGRATIONS.map((item) => (
          <li className="future-item" key={item.name}>
            <span className="future-badge">Próximamente</span>
            <span>
              <strong>{item.name}</strong> — {item.description}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
