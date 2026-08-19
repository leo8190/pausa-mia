import { describe, expect, it, vi } from 'vitest';
import { resolveSessionPepper } from '../index.mjs';

describe('session pepper policy', () => {
  it('exige SESSION_PEPPER fuerte en produccion/deploy', () => {
    expect(() =>
      resolveSessionPepper(
        {
          NODE_ENV: 'production',
          SESSION_PEPPER: '',
        },
        { warn: vi.fn() },
      ),
    ).toThrow('SESSION_PEPPER_REQUIRED_STRONG');

    expect(() =>
      resolveSessionPepper(
        {
          NODE_ENV: 'production',
          SESSION_PEPPER: 'debil-123',
        },
        { warn: vi.fn() },
      ),
    ).toThrow('SESSION_PEPPER_REQUIRED_STRONG');
  });

  it('acepta pepper fuerte configurado en produccion', () => {
    const pepper = 'PepperSuperFuerte-2026-ALFA_beta#9090';
    const resolved = resolveSessionPepper(
      {
        NODE_ENV: 'production',
        SESSION_PEPPER: pepper,
      },
      { warn: vi.fn() },
    );
    expect(resolved).toBe(pepper);
  });

  it('genera pepper efimero en desarrollo/test con warning', () => {
    const logger = { warn: vi.fn() };
    const resolved = resolveSessionPepper(
      {
        NODE_ENV: 'development',
        SESSION_PEPPER: '',
      },
      logger,
    );
    expect(typeof resolved).toBe('string');
    expect(resolved.length).toBe(64);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatch(/efimero/i);
    expect(logger.warn.mock.calls[0][0]).not.toContain(resolved);
  });
});
