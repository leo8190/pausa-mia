const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

function normalizePathname(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '' : trimmed;
}

export function normalizeAccountApiUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!HTTP_PROTOCOLS.has(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    const basePath = normalizePathname(parsed.pathname);
    return `${parsed.origin}${basePath}`;
  } catch {
    return null;
  }
}

export function getAccountApiBaseUrl(env: Record<string, unknown> = import.meta.env) {
  return normalizeAccountApiUrl(env.VITE_ACCOUNT_API_URL) ?? '';
}

export function buildAccountApiUrl(
  path: string,
  env: Record<string, unknown> = import.meta.env,
) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getAccountApiBaseUrl(env);
  return `${baseUrl}${normalizedPath}`;
}
