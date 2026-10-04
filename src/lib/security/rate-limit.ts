import 'server-only';

// In-memory sliding-window rate limiter. Sufficient for single-instance
// deploys (sandbox, small VPS). For multi-instance, replace with Redis.
//
// Each bucket key (e.g. "ip:1.2.3.4:endpoint:/api/token/auth") holds an
// array of request timestamps within the window. On each request:
//   1. Drop timestamps older than (now - windowMs).
//   2. If remaining length >= limit → reject (HTTP 429).
//   3. Otherwise push current timestamp.
//
// This is a true sliding window (not fixed window), so bursts at the
// boundary don't get a 2x allowance.

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min
let lastCleanup = Date.now();

const MAX_NONCE_TTL_MS = 6 * 60 * 1000; // slightly longer than the longest rate-limit window

function cleanupIfNeeded(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [k, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < MAX_NONCE_TTL_MS);
    if (b.hits.length === 0) buckets.delete(k);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
  resetAtMs: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  cleanupIfNeeded(now);

  const b = buckets.get(key) || { hits: [] };
  // Drop expired hits.
  b.hits = b.hits.filter((t) => now - t < windowMs);

  if (b.hits.length >= limit) {
    // Oldest hit is when the window will allow the next request.
    const oldest = b.hits[0];
    const resetAtMs = oldest + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
    buckets.set(key, b);
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSec,
      resetAtMs,
    };
  }

  b.hits.push(now);
  buckets.set(key, b);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - b.hits.length),
    retryAfterSec: 0,
    resetAtMs: 0,
  };
}

// Compose a composite bucket key for an IP+endpoint combo.
export function rateLimitKey(...parts: string[]): string {
  return parts.join(':');
}

// Test-only helper.
export function _clearRateLimit() {
  buckets.clear();
}
