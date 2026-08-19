/**
 * Estado de conectores mostrado dentro de "Fuentes que podés agregar".
 * El flujo OAuth real vive en el panel de cuenta autenticada; esta sección
 * sigue enfocada en importación de archivos locales.
 */

export type OnlineConnectorStatus = {
  /** Siempre false en esta sección: acá no se inicia OAuth. */
  active: false;
  configured: boolean;
  reason: string;
};

export function isOnlineConnectorConfigured(): boolean {
  return true;
}

export function isOnlineConnectorActive(): boolean {
  return false;
}

export function getOnlineConnectorStatus(): OnlineConnectorStatus {
  return {
    active: false,
    configured: isOnlineConnectorConfigured(),
    reason:
      'En este paso sólo se permiten archivos locales. Para conectar Google Calendar o Google Drive usá el panel de cuenta autenticada en Bienvenida.',
  };
}
