import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAccountStore } from '../store/createStore.mjs';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'meditacion-store-'));
}

describe('account store', () => {
  it('crea sesiones con token hasheado y las revoca', async () => {
    const dir = makeTempDir();
    const store = await createAccountStore({
      fallbackPath: join(dir, 'app-store.json'),
      forceEngine: 'json',
    });
    const user = store.createUser({
      displayName: 'León',
      locale: 'es-AR',
      loginSecretHash: 'hash',
      loginSecretSalt: 'salt',
    });

    const session = store.createSession({
      userId: user.id,
      tokenHash: 'token-hash-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(session.userId).toBe(user.id);

    const saved = store.getSessionByTokenHash('token-hash-1');
    expect(saved).not.toBeNull();
    expect(saved.revokedAt).toBeNull();

    store.revokeSessionByTokenHash('token-hash-1');
    const revoked = store.getSessionByTokenHash('token-hash-1');
    expect(revoked.revokedAt).not.toBeNull();

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('aísla context_items y consentimientos por usuario', async () => {
    const dir = makeTempDir();
    const store = await createAccountStore({
      fallbackPath: join(dir, 'app-store.json'),
      forceEngine: 'json',
    });

    const userA = store.createUser({
      displayName: 'A',
      locale: 'es-AR',
      loginSecretHash: 'hash-a',
      loginSecretSalt: 'salt-a',
    });
    const userB = store.createUser({
      displayName: 'B',
      locale: 'es-neutro',
      loginSecretHash: 'hash-b',
      loginSecretSalt: 'salt-b',
    });

    store.createContextItem({
      userId: userA.id,
      sourceType: 'journal',
      label: 'Diario A',
      content: 'Contenido A',
      origin: 'typed',
      selected: true,
    });
    store.createContextItem({
      userId: userB.id,
      sourceType: 'journal',
      label: 'Diario B',
      content: 'Contenido B',
      origin: 'typed',
      selected: true,
    });

    store.createConsent({
      userId: userA.id,
      provider: 'google_calendar',
      purpose: 'calendar_freebusy',
      scopes: ['scope:a'],
      evidence: 'consent-a',
    });
    store.createConsent({
      userId: userB.id,
      provider: 'google_calendar',
      purpose: 'calendar_freebusy',
      scopes: ['scope:b'],
      evidence: 'consent-b',
    });

    const contextA = store.listContextItemsByUser(userA.id);
    const contextB = store.listContextItemsByUser(userB.id);
    expect(contextA).toHaveLength(1);
    expect(contextB).toHaveLength(1);
    expect(contextA[0].label).toBe('Diario A');
    expect(contextB[0].label).toBe('Diario B');

    const consentsA = store.listActiveConsents(userA.id, 'google_calendar');
    const consentsB = store.listActiveConsents(userB.id, 'google_calendar');
    expect(consentsA).toHaveLength(1);
    expect(consentsB).toHaveLength(1);
    expect(consentsA[0].evidence).toBe('consent-a');
    expect(consentsB[0].evidence).toBe('consent-b');

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('borra cascada de datos al borrar cuenta', async () => {
    const dir = makeTempDir();
    const store = await createAccountStore({
      fallbackPath: join(dir, 'app-store.json'),
      forceEngine: 'json',
    });
    const user = store.createUser({
      displayName: 'Cuenta',
      locale: 'es-AR',
      loginSecretHash: 'hash',
      loginSecretSalt: 'salt',
    });
    const consent = store.createConsent({
      userId: user.id,
      provider: 'google_drive',
      purpose: 'drive_file',
      scopes: ['drive.file'],
      evidence: 'ok',
    });
    store.createSession({
      userId: user.id,
      tokenHash: 'token-hash-delete',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    store.createContextItem({
      userId: user.id,
      sourceType: 'drive',
      label: 'Archivo',
      content: 'Recorte',
      origin: 'connector',
    });

    expect(store.getUserById(user.id)).not.toBeNull();
    expect(store.getConsentById(consent.id)).not.toBeNull();

    store.deleteAccount(user.id);

    expect(store.getUserById(user.id)).toBeNull();
    expect(store.getSessionByTokenHash('token-hash-delete')).toBeNull();
    expect(store.listActiveConsents(user.id, 'google_drive')).toHaveLength(0);
    expect(store.listContextItemsByUser(user.id)).toHaveLength(0);

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
