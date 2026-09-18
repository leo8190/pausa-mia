import { describe, expect, it, vi } from 'vitest';
import { revokeGoogleAccountsBeforeDeletion } from '../accountDeletion.mjs';

const link = (provider = 'google_drive') => ({
  provider,
  tokenCiphertext: 'synthetic-ciphertext',
});

describe('account deletion Google revocation', () => {
  it('does not contact a provider when there are no Google links', async () => {
    const revoke = vi.fn();
    expect(
      await revokeGoogleAccountsBeforeDeletion(
        [{ provider: 'social_networks' }],
        revoke,
      ),
    ).toBe('not_linked');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('revokes each Google link and reports only confirmed success', async () => {
    const revoke = vi.fn().mockResolvedValue({ ok: true });
    expect(
      await revokeGoogleAccountsBeforeDeletion(
        [link(), link('google_calendar')],
        revoke,
      ),
    ).toBe('revoked');
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, { ok: false }])(
    'does not infer success from an ambiguous result (%s)',
    async (result) => {
      expect(
        await revokeGoogleAccountsBeforeDeletion(
          [link()],
          vi.fn().mockResolvedValue(result),
        ),
      ).toBe('unconfirmed');
    },
  );

  it('still attempts the other link when one provider call fails', async () => {
    const revoke = vi
      .fn()
      .mockRejectedValueOnce(new Error('synthetic secret must not escape'))
      .mockResolvedValueOnce({ ok: true });
    expect(
      await revokeGoogleAccountsBeforeDeletion(
        [link(), link('google_calendar')],
        revoke,
      ),
    ).toBe('unconfirmed');
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('does not call or claim remote success with a missing local token', async () => {
    const revoke = vi.fn();
    expect(
      await revokeGoogleAccountsBeforeDeletion(
        [{ ...link(), tokenCiphertext: null, status: 'revoked' }],
        revoke,
      ),
    ).toBe('unconfirmed');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('bounds the wait and aborts outstanding requests without retrying', async () => {
    vi.useFakeTimers();
    try {
      let signal;
      const revoke = vi.fn((_linked, options) => {
        signal = options.signal;
        return new Promise(() => {});
      });
      const pending = revokeGoogleAccountsBeforeDeletion([link()], revoke, 50);
      await vi.advanceTimersByTimeAsync(50);
      expect(await pending).toBe('unconfirmed');
      expect(signal.aborted).toBe(true);
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
