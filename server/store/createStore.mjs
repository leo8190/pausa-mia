import { mkdirSync } from 'node:fs';
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

  mkdirSync(dirname(sqlitePath), { recursive: true });

  if (forceEngine === 'json') {
    return createJsonStore(fallbackPath);
  }

  try {
    return await createSqliteStore(sqlitePath);
  } catch (error) {
    if (forceEngine === 'sqlite') {
      throw error;
    }
    return createJsonStore(fallbackPath);
  }
}
