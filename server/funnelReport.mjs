#!/usr/bin/env node
/** Private aggregate report. Invoke inside the existing Fly machine over SSH. */
import { createAccountStore } from './store/createStore.mjs';
import { FUNNEL_RETENTION_DAYS } from './funnel.mjs';

const store = await createAccountStore({
  sqlitePath: process.env.ACCOUNT_DB_PATH,
  fallbackPath: process.env.ACCOUNT_STORE_JSON_PATH,
});
try {
  if (process.env.NODE_ENV === 'production' && store.kind !== 'sqlite') {
    throw new Error('FUNNEL_REPORT_STORE_UNEXPECTED');
  }
  process.stdout.write(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        population: 'consented_runs_only',
        retentionDays: FUNNEL_RETENTION_DAYS,
        counts: store.getFunnelReport(),
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  store.close();
}
