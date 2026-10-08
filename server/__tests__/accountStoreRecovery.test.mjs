import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createAccountStore } from '../store/createStore.mjs';

describe('existing account database recovery', () => {
  it('does not create an empty DB or JSON store when the mounted DB is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pausa-recovery-'));
    try {
      const sqlitePath = join(dir, 'missing-mount', 'app.db');
      const fallbackPath = join(dir, 'app-store.json');
      await expect(
        createAccountStore({ sqlitePath, fallbackPath, requireExistingSqlite: true }),
      ).rejects.toThrow('ACCOUNT_DB_MISSING_RESTORE_REQUIRED');
      expect(existsSync(sqlitePath)).toBe(false);
      expect(existsSync(fallbackPath)).toBe(false);
      expect(existsSync(join(dir, 'missing-mount'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('reopens the original records without resurrecting a deleted account', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pausa-recovery-'));
    const sqlitePath = join(dir, 'app.db');
    const fallbackPath = join(dir, 'app-store.json');
    let store;
    try {
      store = await createAccountStore({
        sqlitePath,
        fallbackPath,
        forceEngine: 'sqlite',
      });
      const active = store.createUser({
        displayName: 'Fixture active',
        locale: 'es-AR',
        loginSecretHash: 'fixture-hash',
        loginSecretSalt: 'fixture-salt',
      });
      const deleted = store.createUser({
        displayName: 'Fixture deleted',
        locale: 'es-AR',
        loginSecretHash: 'fixture-hash',
        loginSecretSalt: 'fixture-salt',
      });
      store.deleteAccount(deleted.id);
      store.close();
      store = undefined;
      store = await createAccountStore({
        sqlitePath,
        fallbackPath,
        requireExistingSqlite: true,
      });
      expect(store.kind).toBe('sqlite');
      expect(store.findActiveUserById(active.id)?.id).toBe(active.id);
      expect(store.findActiveUserById(deleted.id)).toBeNull();
      expect(existsSync(fallbackPath)).toBe(false);
    } finally {
      store?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('does not silently open or overwrite JSON if the original SQLite file is corrupt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pausa-recovery-'));
    try {
      const sqlitePath = join(dir, 'app.db');
      const fallbackPath = join(dir, 'app-store.json');
      writeFileSync(sqlitePath, 'fixture deliberately invalid SQLite');
      const original = '{"fixture":"existing fallback remains untouched"}';
      writeFileSync(fallbackPath, original);
      await expect(
        createAccountStore({ sqlitePath, fallbackPath, requireExistingSqlite: true }),
      ).rejects.toThrow();
      expect(readFileSync(fallbackPath, 'utf8')).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('cannot select the JSON fallback during a protected recovery', async () => {
    await expect(
      createAccountStore({ forceEngine: 'json', requireExistingSqlite: true }),
    ).rejects.toThrow('ACCOUNT_RESTORE_REQUIRES_SQLITE');
  });
  it('does not migrate a valid SQLite file belonging to another application', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pausa-recovery-'));
    const sqlitePath = join(dir, 'app.db');
    const { DatabaseSync } = createRequire(import.meta.url)(`node:${'sqlite'}`);
    try {
      const foreign = new DatabaseSync(sqlitePath);
      foreign.exec('CREATE TABLE another_application (id TEXT)');
      foreign.close();
      const before = readFileSync(sqlitePath);
      await expect(
        createAccountStore({
          sqlitePath,
          fallbackPath: join(dir, 'fallback.json'),
          requireExistingSqlite: true,
        }),
      ).rejects.toThrow('ACCOUNT_DB_UNEXPECTED_SCHEMA');
      expect(readFileSync(sqlitePath)).toEqual(before);
      expect(existsSync(join(dir, 'fallback.json'))).toBe(false);
      const inspected = new DatabaseSync(sqlitePath, { readOnly: true });
      expect(
        inspected.prepare("SELECT name FROM sqlite_master WHERE name='users'").get(),
      ).toBeUndefined();
      inspected.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
