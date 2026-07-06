/**
 * Lightweight in-memory rate limiter for the public, unauthenticated endpoints
 * (`/api/chat`, `/api/voice/*`, `/api/onboarding/scrape`) — none of which had
 * any throttling before this. Fixed-window counter per key, held in a
 * module-level Map.
 *
 * Deployment tradeoff (Vercel): this state lives in one serverless function
 * instance's memory, not a shared store. On Vercel each concurrent instance
 * (and each region, and each cold start) gets its own counter, so the *actual*
 * effective limit under heavy concurrent load is "the configured limit,
 * multiplied by however many instances are warm" rather than a hard global
 * cap. It still meaningfully blocks the common cases (a single script/browser
 * hammering an endpoint, one instance absorbing a burst) with zero new
 * infrastructure or env vars. If abuse in production turns out to route
 * across many instances, replace this with a shared store — Vercel's Upstash
 * Redis integration + `@upstash/ratelimit` is the standard drop-in in that
 * case (same call shape, swap the backing store).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Bounds memory in a long-lived warm instance; pruned opportunistically. */
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying, when not allowed. */
  retryAfterSeconds: number;
}

/** True = handed off to the channel; false = failed (recorded as such). */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_TRACKED_KEYS) pruneExpired(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Best-effort client IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard 429 JSON response with a Retry-After header. */
export function tooManyRequests(retryAfterSeconds: number, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: "Too many requests. Please try again shortly." }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
      ...extraHeaders,
    },
  });
}
