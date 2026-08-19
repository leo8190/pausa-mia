import { describe, expect, it } from 'vitest';
import {
  getOnlineConnectorStatus,
  isOnlineConnectorActive,
} from '../lib/onlineConnector';

describe('onlineConnector', () => {
  it('never reports OAuth active when the prototype has no flow implementation', () => {
    const status = getOnlineConnectorStatus();
    expect(isOnlineConnectorActive()).toBe(false);
    expect(status.active).toBe(false);
    expect(status.reason).toMatch(/OAuth|conexión/i);
  });
});
