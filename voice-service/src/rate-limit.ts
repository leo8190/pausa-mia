import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

const RATE_LIMIT_WINDOW_MS = 60_000;

type Bucket = {
  windowStartMs: number;
  hits: number;
};

export type TtsRateLimitCheck =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export class InMemoryTtsRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxHitsPerMinute: number,
    private readonly nowMs: () => number = Date.now,
  ) {}

  check(clientId: string): TtsRateLimitCheck {
    const now = this.nowMs();
    const windowStartMs = Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
    const bucket = this.buckets.get(clientId);
    if (!bucket || bucket.windowStartMs !== windowStartMs) {
      this.buckets.set(clientId, { windowStartMs, hits: 1 });
      this.gcStaleBuckets(windowStartMs);
      return { ok: true };
    }

    if (bucket.hits >= this.maxHitsPerMinute) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowStartMs + RATE_LIMIT_WINDOW_MS - now) / 1000),
      );
      return { ok: false, retryAfterSeconds };
    }

    bucket.hits += 1;
    return { ok: true };
  }

  private gcStaleBuckets(currentWindowStartMs: number): void {
    if (this.buckets.size < 5_000) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.windowStartMs + RATE_LIMIT_WINDOW_MS < currentWindowStartMs) {
        this.buckets.delete(key);
      }
    }
  }
}

function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

function firstValidIpFromCsv(headerValue: string): string | null {
  for (const rawCandidate of headerValue.split(',')) {
    const candidate = normalizeIp(rawCandidate.trim());
    if (!candidate) continue;
    if (isIP(candidate) !== 0) {
      return candidate;
    }
  }
  return null;
}

export function resolveClientId(req: IncomingMessage): string {
  const flyClientIp = req.headers['fly-client-ip'];
  if (typeof flyClientIp === 'string') {
    const candidate = normalizeIp(flyClientIp.trim());
    if (candidate && isIP(candidate) !== 0) {
      return candidate;
    }
  }

  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string') {
    const candidate = firstValidIpFromCsv(xForwardedFor);
    if (candidate) {
      return candidate;
    }
  }

  const remoteAddress = req.socket.remoteAddress;
  if (remoteAddress) {
    const candidate = normalizeIp(remoteAddress);
    if (isIP(candidate) !== 0) {
      return candidate;
    }
  }

  return 'unknown';
}
