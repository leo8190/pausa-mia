import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createSqliteStore } from './sqliteStore.mjs';
import { createJsonStore } from './jsonStore.mjs';

export const DEFAULT_DATA_DIR = resolve(process.cwd(), 'server', 'data');

/**
 * Contrato mínimo para persistencia de cuentas/sesión.
 * Se mantiene desacoplado para reemplazo por Postgres en siguiente fase.
 */
export async function createAccountStore(options = {}) {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const sqlitePath = options.sqlitePath ?? resolve(dataDir, 'app.db');
  const fallbackPath = options.fallbackPath ?? resolve(dataDir, 'app-store.json');
  const forceEngine = options.forceEngine ?? process.env.ACCOUNT_STORE_ENGINE ?? '';
  const requireExistingSqlite =
    options.requireExistingSqlite ?? process.env.ACCOUNT_REQUIRE_EXISTING_DB === 'true';

  // Recovery must never turn a missing/corrupt volume into a new empty account
  // database. This check happens before any directory or store is created.
  if (requireExistingSqlite) {
    if (forceEngine === 'json') throw new Error('ACCOUNT_RESTORE_REQUIRES_SQLITE');
    let existing;
    try {
      existing = statSync(sqlitePath);
    } catch {
      throw new Error('ACCOUNT_DB_MISSING_RESTORE_REQUIRED');
    }
    if (!existing.isFile() || existing.size === 0) {
      throw new Error('ACCOUNT_DB_MISSING_RESTORE_REQUIRED');
    }
  }

  mkdirSync(dirname(sqlitePath), { recursive: true });

  if (forceEngine === 'json') {
    return createJsonStore(fallbackPath);
  }

  try {
    return await createSqliteStore(sqlitePath, {
      requireExisting: requireExistingSqlite,
    });
  } catch (error) {
    if (forceEngine === 'sqlite' || requireExistingSqlite) {
      throw error;
    }
    return createJsonStore(fallbackPath);
  }
}
