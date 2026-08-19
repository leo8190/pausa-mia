export const CONNECTOR_STATES = new Set([
  'disconnected',
  'connected',
  'revoked',
  'error',
]);
export const SUPPORTED_CONNECTOR_PROVIDERS = [
  'google_calendar',
  'google_drive',
  'social_networks',
];

export class ConnectorNotConfiguredError extends Error {
  constructor(provider) {
    super(`Connector "${provider}" is not configured`);
    this.name = 'ConnectorNotConfiguredError';
    this.code = 'CONNECTOR_NOT_CONFIGURED';
    this.provider = provider;
  }
}

class NotConfiguredConnector {
  constructor(provider) {
    this.provider = provider;
  }

  async connect() {
    throw new ConnectorNotConfiguredError(this.provider);
  }

  async revoke() {
    throw new ConnectorNotConfiguredError(this.provider);
  }

  async fetchPreview() {
    throw new ConnectorNotConfiguredError(this.provider);
  }
}

export function getConnector(provider) {
  if (!SUPPORTED_CONNECTOR_PROVIDERS.includes(provider)) {
    return null;
  }
  return new NotConfiguredConnector(provider);
}
