/**
 * Adaptador de conexión en línea. Este prototipo no implementa OAuth ni
 * intercambia credenciales: el adaptador sólo reporta estado para la UI.
 *
 * Sin `VITE_OAUTH_CONNECTOR_ENABLED=true` y `VITE_OAUTH_CLIENT_ID` queda
 * inactivo. Aunque esas variables existan, tampoco inicia ningún flujo: los
 * botones permanecen deshabilitados y no se envía nada.
 */

export type OnlineConnectorStatus = {
  /** Siempre false en este prototipo: no hay flujo OAuth implementado. */
  active: false;
  configured: boolean;
  reason: string;
};

function readEnv(
  name: 'VITE_OAUTH_CONNECTOR_ENABLED' | 'VITE_OAUTH_CLIENT_ID',
): string {
  const raw = import.meta.env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isOnlineConnectorConfigured(): boolean {
  return (
    readEnv('VITE_OAUTH_CONNECTOR_ENABLED').toLowerCase() === 'true' &&
    readEnv('VITE_OAUTH_CLIENT_ID').length > 0
  );
}

export function isOnlineConnectorActive(): boolean {
  return false;
}

export function getOnlineConnectorStatus(): OnlineConnectorStatus {
  if (!isOnlineConnectorConfigured()) {
    return {
      active: false,
      configured: false,
      reason:
        'Conexión en línea no activa: faltan credenciales o configuración (VITE_OAUTH_CONNECTOR_ENABLED y VITE_OAUTH_CLIENT_ID). Este prototipo no inicia OAuth.',
    };
  }

  return {
    active: false,
    configured: true,
    reason:
      'Hay variables de entorno de conector, pero OAuth no está implementado en este prototipo. El botón permanece desactivado y no se envían datos.',
  };
}
