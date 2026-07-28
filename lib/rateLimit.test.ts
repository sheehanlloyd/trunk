import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clientIp, rateLimit, tooManyRequests } from "./rateLimit";

/**
 * These cover the two behaviors that actually matter in production: the
 * in-memory fallback still counts correctly with no Redis configured, and a
 * broken/slow Redis degrades to that fallback instead of taking the endpoint
 * down with it (fail-open, per the module docs).
 */

const REDIS_ENV = {
  UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

/** Unique key per test so the module-level Map never leaks between cases. */
let n = 0;
const freshKey = () => `test-key-${Date.now()}-${n++}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("rateLimit — in-memory backend", () => {
  it("allows up to the limit, then blocks with a retry hint", async () => {
    const key = freshKey();
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);

    const blocked = await rateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts each key independently", async () => {
    const a = freshKey();
    const b = freshKey();
    await rateLimit(a, 1, 60_000);
    expect((await rateLimit(a, 1, 60_000)).allowed).toBe(false);
    expect((await rateLimit(b, 1, 60_000)).allowed).toBe(true);
  });

  it("lets the caller through again once the window has elapsed", async () => {
    const key = freshKey();
    expect((await rateLimit(key, 1, 20)).allowed).toBe(true);
    expect((await rateLimit(key, 1, 20)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect((await rateLimit(key, 1, 20)).allowed).toBe(true);
  });
});

describe("rateLimit — shared (Redis) backend", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(REDIS_ENV)) vi.stubEnv(k, v);
  });

  it("blocks once the shared counter passes the limit", async () => {
    // INCR returns the post-increment value; 3 > limit of 2 → blocked.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ result: 3 }, { result: 1 }]), { status: 200 }),
      ),
    );
    const result = await rateLimit(freshKey(), 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows while the shared counter is within the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 }),
      ),
    );
    expect((await rateLimit(freshKey(), 5, 60_000)).allowed).toBe(true);
  });

  it("falls back to in-memory counting when Redis throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const key = freshKey();
    // Fail-open: the first call is allowed, and local counting still applies.
    expect((await rateLimit(key, 1, 60_000)).allowed).toBe(true);
    expect((await rateLimit(key, 1, 60_000)).allowed).toBe(false);
  });

  it("falls back when Redis answers with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await rateLimit(freshKey(), 1, 60_000)).allowed).toBe(true);
  });

  it("falls back when Redis returns an unexpected body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ error: "WRONGTYPE" }]), { status: 200 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await rateLimit(freshKey(), 1, 60_000)).allowed).toBe(true);
  });

  it("keys the window bucket so counters reset by expiry", async () => {
    const seenUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      seenUrls.push(url);
      expect(init.method).toBe("POST");
      return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await rateLimit("abc", 5, 60_000);

    expect(seenUrls).toEqual(["https://fake.upstash.io/pipeline"]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body[0][0]).toBe("INCR");
    expect(body[0][1]).toMatch(/^rl:abc:\d+$/);
    expect(body[1]).toEqual(["PEXPIRE", body[0][1], "60000"]);
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a placeholder", () => {
    expect(
      clientIp(new Request("https://example.com", { headers: { "x-real-ip": "198.51.100.4" } })),
    ).toBe("198.51.100.4");
    expect(clientIp(new Request("https://example.com"))).toBe("unknown");
  });
});

describe("tooManyRequests", () => {
  it("returns 429 with a Retry-After header", async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    await expect(res.json()).resolves.toHaveProperty("error");
  });
});
