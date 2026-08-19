import { describe, expect, it, vi } from 'vitest';
import { createGoogleOAuthService } from '../googleOAuth.mjs';

const oauthConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUris: {
    google_calendar: 'http://localhost:3001/api/connectors/google_calendar/oauth/callback',
    google_drive: 'http://localhost:3001/api/connectors/google_drive/oauth/callback',
  },
  tokenEncryptionKey: Buffer.alloc(32, 7),
  tokenEncryptionKid: 'test-kid',
};

describe('googleOAuth service', () => {
  it('builds OAuth start URL with PKCE and one-time state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-123',
        refresh_token: 'refresh-123',
        expires_in: 3600,
        scope: 'scope:a scope:b',
        token_type: 'Bearer',
      }),
    });
    const oauth = createGoogleOAuthService({
      config: oauthConfig,
      fetchImpl: fetchMock,
    });

    const started = oauth.createStart({
      userId: 'user-1',
      provider: 'google_calendar',
      scopes: ['scope:a', 'scope:b'],
    });
    const url = new URL(started.authorizationUrl);
    const state = url.searchParams.get('state');

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(state).toBeTruthy();

    const linked = await oauth.exchangeCode({ code: 'code-123', state });
    expect(linked.userId).toBe('user-1');
    expect(linked.provider).toBe('google_calendar');
    expect(linked.tokenCiphertext).not.toContain('access-123');
    expect(linked.tokenKid).toBe('test-kid');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(oauth.exchangeCode({ code: 'code-123', state })).rejects.toThrow(
      'OAUTH_STATE_INVALID',
    );
  });

  it('revokes token remotely using encrypted payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-123',
          refresh_token: 'refresh-123',
          expires_in: 3600,
          scope: 'scope:a',
          token_type: 'Bearer',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    const oauth = createGoogleOAuthService({
      config: oauthConfig,
      fetchImpl: fetchMock,
    });
    const started = oauth.createStart({
      userId: 'user-2',
      provider: 'google_drive',
      scopes: ['scope:a'],
    });
    const state = new URL(started.authorizationUrl).searchParams.get('state');
    const linked = await oauth.exchangeCode({ code: 'code-xyz', state });

    await oauth.revokeLinkedAccount({ tokenCiphertext: linked.tokenCiphertext });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('oauth2.googleapis.com/revoke');
  });
});
