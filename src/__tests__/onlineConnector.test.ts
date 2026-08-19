import { describe, expect, it } from 'vitest';
import {
  getOnlineConnectorStatus,
  isOnlineConnectorActive,
} from '../lib/onlineConnector';

describe('onlineConnector', () => {
  it('keeps OAuth inactive in context-step imports and points to account panel', () => {
    const status = getOnlineConnectorStatus();
    expect(isOnlineConnectorActive()).toBe(false);
    expect(status.active).toBe(false);
    expect(status.configured).toBe(true);
    expect(status.reason).toMatch(/cuenta autenticada|bienvenida/i);
  });
});
