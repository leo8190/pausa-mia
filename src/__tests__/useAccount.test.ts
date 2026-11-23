import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAccount } from '../hooks/useAccount';

const user = {
  id: 'usr-onboarding-test',
  createdAt: '2026-11-23T00:00:00Z',
  displayName: null,
  locale: 'es-AR',
  status: 'active',
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function pendingStatus() {
  let resolve!: (value: ReturnType<typeof jsonResponse>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ReturnType<typeof jsonResponse>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('account status during onboarding', () => {
  it.each(['register', 'login'] as const)(
    'keeps the successful %s when an earlier guest status arrives late',
    async (operation) => {
      const status = pendingStatus();
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) =>
          String(input).endsWith('/api/account/status')
            ? status.promise
            : Promise.resolve(jsonResponse({ user })),
        ),
      );
      const hook = renderHook(() => useAccount());
      await act(async () => {
        const ok =
          operation === 'register'
            ? await hook.result.current.register('', 'solo-prueba-123', 'es-AR')
            : await hook.result.current.login(user.id, 'solo-prueba-123');
        expect(ok).toBe(true);
      });
      expect(hook.result.current.user?.id).toBe(user.id);
      await act(async () => status.resolve(jsonResponse({ authenticated: false })));
      expect(hook.result.current.phase).toBe('account');
      expect(hook.result.current.user?.id).toBe(user.id);
    },
  );

  it('keeps the newly created account if the earlier status request fails', async () => {
    const status = pendingStatus();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith('/api/account/status')
          ? status.promise
          : Promise.resolve(jsonResponse({ user })),
      ),
    );
    const hook = renderHook(() => useAccount());
    await act(async () => {
      await hook.result.current.register('', 'solo-prueba-123', 'es-AR');
    });
    await act(async () => status.reject(new TypeError('offline')));
    expect(hook.result.current.phase).toBe('account');
    expect(hook.result.current.user?.id).toBe(user.id);
  });

  it('ignores status from a previous account endpoint after its replacement loads', async () => {
    const old = pendingStatus();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).startsWith('https://old.example.test')
          ? old.promise
          : Promise.resolve(jsonResponse({ user })),
      ),
    );
    const hook = renderHook(({ base }) => useAccount(base), {
      initialProps: { base: 'https://old.example.test' },
    });
    hook.rerender({ base: 'https://current.example.test' });
    await waitFor(() => expect(hook.result.current.user?.id).toBe(user.id));
    await act(async () =>
      old.resolve(jsonResponse({ user: { ...user, id: 'usr-old-test' } })),
    );
    expect(hook.result.current.user?.id).toBe(user.id);
  });
});
