/**
 * Contador first-party de visitantes únicos y eventos de producto anónimos.
 * Sólo persiste el hash del id anónimo + nombre de evento; sin IP, nombres ni contenido.
 */

import { createHash } from 'node:crypto';

export const VISITOR_ID_MAX_LENGTH = 64;
export const VISITOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Eventos de producto first-party (sin cuestionario, diario, guion ni ad IDs). */
export const PRODUCT_EVENT_NAMES = Object.freeze(['pageview', 'session_complete']);
export const PRODUCT_EVENTS = new Set(PRODUCT_EVENT_NAMES);

export function isVisitPath(url) {
  if (typeof url !== 'string') return false;
  return url.split('?', 1)[0] === '/api/visit';
}

export function isVisitorsCountPath(url) {
  if (typeof url !== 'string') return false;
  return url.split('?', 1)[0] === '/api/visitors/count';
}

export function isValidVisitorId(value) {
  return (
    typeof value === 'string' &&
    value.length <= VISITOR_ID_MAX_LENGTH &&
    VISITOR_ID_PATTERN.test(value)
  );
}

export function isValidProductEvent(value) {
  return typeof value === 'string' && PRODUCT_EVENTS.has(value);
}

export function hashVisitorId(visitorId, pepper = '') {
  const material = `${pepper}:${visitorId}`;
  return createHash('sha256').update(material, 'utf8').digest('hex');
}
