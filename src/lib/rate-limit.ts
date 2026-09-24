/**
 * In-memory sliding-window rate limiter.
 *
 * PER-INSTANCE ONLY. State lives in this Node process, so limits are
 * enforced per server instance, not globally:
 *   - single-node dev / small deploys: works exactly as configured
 *   - serverless / multi-instance (e.g. Vercel with several lambdas):
 *     each instance keeps its own window, so the effective global limit
 *     is (limit × instances) and counters reset on cold starts
 * That's an acceptable abuse dampener for launch scale. When traffic
 * justifies it, swap the Map for a shared store (Upstash Redis /
 * Vercel KV) behind this same function signature.
 */

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** When rejected: whole seconds until a retry could succeed (>= 1). */
  retryAfterSec: number;
}

interface Bucket {
  /** Request timestamps (ms), oldest first. */
  stamps: number[];
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so long-idle keys don't accumulate forever.
const SWEEP_EVERY_CALLS = 1000;
let callsSinceSweep = 0;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    const newest = bucket.stamps[bucket.stamps.length - 1];
    if (newest === undefined || newest <= now - bucket.windowMs) {
      buckets.delete(key);
    }
  }
}

/**
 * Record a hit for `key` and report whether it's within the limit.
 * Sliding window: a request is allowed if fewer than `limit` requests
 * were recorded in the trailing `windowMs`.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();

  if (++callsSinceSweep >= SWEEP_EVERY_CALLS) {
    callsSinceSweep = 0;
    sweep(now);
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { stamps: [], windowMs };
    buckets.set(key, bucket);
  }
  bucket.windowMs = windowMs;

  const cutoff = now - windowMs;
  const stamps = bucket.stamps;
  while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();

  if (stamps.length >= limit) {
    // The oldest in-window request exits the window at stamps[0] + windowMs.
    const retryAfterSec = Math.max(1, Math.ceil((stamps[0] - cutoff) / 1000));
    return { ok: false, retryAfterSec };
  }

  stamps.push(now);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Client IP for rate-limit keys: first hop of x-forwarded-for (what
 * Vercel/most proxies set), falling back to "local" for direct dev
 * requests that carry no forwarding header.
 */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "local";
}
