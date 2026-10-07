import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { DEFAULT_DATA_DIR } from './store/createStore.mjs';

const require = createRequire(import.meta.url);

/** Read existing persistence only: never create, migrate, purge, or silently fall back. */
export function readFunnelReportSnapshot(env = process.env) {
  const engine = env.ACCOUNT_STORE_ENGINE || 'sqlite';
  if (
    !['sqlite', 'json'].includes(engine) ||
    (env.NODE_ENV === 'production' && engine !== 'sqlite')
  ) {
    throw new Error('FUNNEL_REPORT_STORE_UNEXPECTED');
  }
  const path =
    engine === 'sqlite'
      ? env.ACCOUNT_DB_PATH || resolve(DEFAULT_DATA_DIR, 'app.db')
      : env.ACCOUNT_STORE_JSON_PATH || resolve(DEFAULT_DATA_DIR, 'app-store.json');
  try {
    const file = statSync(path);
    if (!file.isFile() || file.size === 0) throw new Error();
  } catch {
    throw new Error('FUNNEL_REPORT_STORE_MISSING');
  }
  if (engine === 'json') {
    try {
      const state = JSON.parse(readFileSync(path, 'utf-8'));
      if (!Array.isArray(state.funnelRuns) || !Array.isArray(state.funnelEvents))
        throw new Error();
      return { runs: state.funnelRuns, events: state.funnelEvents };
    } catch {
      throw new Error('FUNNEL_REPORT_READ_FAILED');
    }
  }
  let db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(path, { readOnly: true });
    // One read transaction gives a consistent run/event snapshot during live writes.
    db.exec('BEGIN');
    const runs = db
      .prepare(
        `SELECT run_hash AS runHash, source, qa,
      created_at AS createdAt, expires_at AS expiresAt, revoked_at AS revokedAt FROM funnel_runs`,
      )
      .all()
      .map((run) => ({
        ...run,
        qa: run.qa === 0 ? false : run.qa === 1 ? true : null,
      }));
    const events = db
      .prepare(
        `SELECT run_hash AS runHash, event_name AS event,
      created_at AS createdAt FROM funnel_events`,
      )
      .all();
    db.exec('COMMIT');
    return { runs, events };
  } catch {
    throw new Error('FUNNEL_REPORT_READ_FAILED');
  } finally {
    db?.close();
  }
}
