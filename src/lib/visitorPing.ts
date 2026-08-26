import { buildAccountApiUrl } from './accountApiUrl';

export const VISITOR_ID_STORAGE_KEY = 'pausa-mia-vid';

const VISITOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pingStarted = false;

export function isValidVisitorId(value: unknown): value is string {
  return typeof value === 'string' && VISITOR_ID_PATTERN.test(value);
}

/** Id anónimo del navegador; sólo localStorage, sin nombres ni contenido. */
export function getOrCreateVisitorId(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !==
  'undefined'
    ? localStorage
    : null,
  randomUUID: () => string = () => crypto.randomUUID(),
): string | null {
  if (!storage) return null;
  try {
    const existing = storage.getItem(VISITOR_ID_STORAGE_KEY);
    if (isValidVisitorId(existing)) return existing;
    const id = randomUUID();
    if (!isValidVisitorId(id)) return null;
    storage.setItem(VISITOR_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/**
 * Ping mínimo al API first-party. Falla en silencio (modo demo sin backend).
 * No envía diario, estado emocional, guion ni IP.
 */
export function pingUniqueVisitor(
  env: Record<string, unknown> = import.meta.env,
  fetchImpl: typeof fetch = fetch,
): void {
  if (pingStarted) return;
  pingStarted = true;

  const visitorId = getOrCreateVisitorId();
  if (!visitorId) return;

  const url = buildAccountApiUrl('/api/visit', env);
  void fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: visitorId }),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => {
    /* modo demo / API ausente: no bloquear la UI */
  });
}

/** Sólo para tests. */
export function resetVisitorPingForTests() {
  pingStarted = false;
}
