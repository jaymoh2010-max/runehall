export interface RateLimitOptions {
  max: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-memory fixed-window limiter. Runehall is a local-first app, so this
 * deliberately avoids an external store while still raising the cost of
 * password guessing and upload abuse.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const max = Math.max(1, Math.round(options.max));
  const windowMs = Math.max(1_000, Math.round(options.windowMs));
  const clock = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  const check = (key: string): RateLimitResult => {
    const timestamp = clock();
    if (buckets.size > 10_000) {
      for (const [entryKey, bucket] of buckets) {
        if (timestamp >= bucket.resetAt) buckets.delete(entryKey);
      }
    }
    let bucket = buckets.get(key);
    if (!bucket || timestamp >= bucket.resetAt) {
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count >= max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)),
        resetAt: bucket.resetAt,
      };
    }
    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, max - bucket.count),
      retryAfterSec: 0,
      resetAt: bucket.resetAt,
    };
  };

  const reset = (key?: string) => {
    if (key === undefined) buckets.clear();
    else buckets.delete(key);
  };

  return { check, reset };
}
