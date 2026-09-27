import { createHash } from 'node:crypto';
import { isValidVisitorId } from './visitors.mjs';

export const FUNNEL_EVENTS = Object.freeze([
  'entry',
  'questionnaire_started',
  'script_generated',
  'audio_started',
  'audio_finished',
  'closing_reached',
  'feedback_given',
  'script_error',
  'audio_error',
]);
export const FUNNEL_SOURCES = Object.freeze([
  'unattributed',
  'instagram',
  'tiktok',
  'okara',
  'newsletter',
  'shared',
]);
export const FUNNEL_RUN_HOURS = 24;
export const FUNNEL_RETENTION_DAYS = 30;

export function isFunnelEventPath(pathname) {
  return pathname === '/api/funnel/event';
}

export function isFunnelRevokePath(pathname) {
  return pathname === '/api/funnel/revoke';
}

export function hashFunnelRunId(runId, pepper) {
  return createHash('sha256').update(`${pepper}:funnel:${runId}`).digest('hex');
}

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

export function validateFunnelEvent(body) {
  if (!isPlainObject(body) || !isValidVisitorId(body.runId)) return null;
  if (!FUNNEL_EVENTS.includes(body.event)) return null;
  const isEntry = body.event === 'entry';
  const keys = Object.keys(body).sort();
  if (isEntry) {
    if (!FUNNEL_SOURCES.includes(body.source)) return null;
    if (body.qa !== undefined && typeof body.qa !== 'boolean') return null;
    if (
      keys.join(',') !== 'event,runId,source' &&
      keys.join(',') !== 'event,qa,runId,source'
    )
      return null;
  } else if (keys.join(',') !== 'event,runId') {
    return null;
  }
  return {
    runId: body.runId,
    event: body.event,
    source: isEntry ? body.source : null,
    qa: isEntry && body.qa === true,
  };
}

export function validateFunnelRevoke(body) {
  if (!isPlainObject(body) || !isValidVisitorId(body.runId)) return null;
  if (Object.keys(body).join(',') !== 'runId') return null;
  return body.runId;
}
