/**
 * Rate limiting for the public, unauthenticated endpoints (`/api/chat`,
 * `/api/voice/*`, `/api/onboarding/scrape`) and a couple of expensive
 * authenticated ones (the AI test console).
 *
 * Two backends, chosen by env at call time:
 *
 *  - **Shared (Upstash Redis)** when UPSTASH_REDIS_REST_URL and
 *    UPSTASH_REDIS_REST_TOKEN are set. Counters live in Redis, so the limit is
 *    a real global cap no matter how many serverless instances or regions are
 *    warm. Spoken to over its REST API with plain `fetch` — no SDK, no new
 *    dependency, and nothing to bundle into the voice path.
 *
 *  - **In-memory** otherwise. A fixed-window counter in a module-level Map.
 *    Each instance counts on its own, so under heavy concurrency the effective
 *    cap is "limit × warm instances". That still stops the common cases (one
 *    script hammering an endpoint, one instance absorbing a burst) and keeps
 *    local dev and CI free of infrastructure.
 *
 * Failure policy is deliberately fail-*open* onto the in-memory limiter: if
 * Redis is slow or down, callers fall back to local counting rather than
 * getting 429s or waiting. A rate limiter that takes an API outage down with it
 * is worse than one that degrades to per-instance accuracy for a few minutes —
 * and a real phone call is on the other end of the voice routes.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Bounds memory in a long-lived warm instance; pruned opportunistically. */
const MAX_TRACKED_KEYS = 5000;

/**
 * Redis must answer fast or not at all. This budget is well under the latency
 * a caller would notice on a live call, and a timeout just falls back to the
 * in-memory counter.
 */
const REDIS_TIMEOUT_MS = 700;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying, when not allowed. */
  retryAfterSeconds: number;
}

interface RedisConfig {
  url: string;
  token: string;
}

/** Read per call (not at module load) so tests and env changes are honored. */
function redisConfig(): RedisConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

/**
 * Fixed-window counter in Redis.
 *
 * The window number is baked into the key, so the counter resets by expiring
 * rather than by anyone having to reset it, and two racing requests can't lose
 * an increment — INCR is atomic and returns the post-increment value. PEXPIRE
 * is unconditional: since the key already belongs to exactly one window,
 * refreshing its TTL can only extend the life of a key that is about to be
 * abandoned anyway, never widen the window being counted.
 */
async function redisRateLimit(
  config: RedisConfig,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const redisKey = `rl:${key}:${windowStart}`;

  try {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(windowMs)],
      ]),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[rateLimit] redis rejected pipeline (status=${res.status})`);
      return null;
    }

    const body = (await res.json()) as ({ result?: number; error?: string } | null)[];
    const count = body?.[0]?.result;
    if (typeof count !== "number") {
      console.error("[rateLimit] redis returned no counter value");
      return null;
    }

    if (count > limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    // Timeout, DNS, network — anything. Fall back to the local limiter.
    console.error("[rateLimit] redis unavailable, using in-memory fallback", err);
    return null;
  }
}

/** Fixed-window counter in this instance's memory. */
function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
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

/**
 * Consume one unit against `key`. Uses Redis when configured, otherwise (or on
 * any Redis failure) this instance's memory.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const config = redisConfig();
  if (config) {
    const shared = await redisRateLimit(config, key, limit, windowMs);
    if (shared) return shared;
  }
  return memoryRateLimit(key, limit, windowMs);
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
