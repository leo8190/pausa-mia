#!/usr/bin/env node
/** Private aggregate report. Invoke inside the existing Fly machine over SSH. */
import { buildFunnelAnalytics } from './funnelAnalytics.mjs';
import { readFunnelReportSnapshot } from './funnelReportSnapshot.mjs';

try {
  process.stdout.write(
    JSON.stringify(buildFunnelAnalytics(readFunnelReportSnapshot()), null, 2) + '\n',
  );
} catch (error) {
  const codes = new Set([
    'FUNNEL_REPORT_STORE_MISSING',
    'FUNNEL_REPORT_STORE_UNEXPECTED',
    'FUNNEL_REPORT_READ_FAILED',
  ]);
  const code = codes.has(error?.message) ? error.message : 'FUNNEL_REPORT_READ_FAILED';
  // No raw error, database path, credential, row, IP or request header in diagnostics.
  process.stdout.write(
    JSON.stringify({
      schemaVersion: 2,
      dataStatus: 'unavailable',
      code,
      counts: null,
    }) + '\n',
  );
  process.exitCode = 1;
}
