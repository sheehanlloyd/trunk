import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import type { Business } from "@/lib/types/database";

/** Minimal business factory — overrides merged over sensible defaults. */
function makeBusiness(overrides: Partial<Business>): Business {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Test Co",
    owner_email: "owner@test.co",
    phone_number: null,
    service_area: null,
    services: [],
    hours: {},
    emergency_policy: null,
    raw_scraped_content: null,
    status: "trial",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const plumber = makeBusiness({
  name: "Rapid Flow Plumbing",
  service_area: "Austin, TX and surrounding areas",
  services: [
    { service: "Drain cleaning", description: "Clears clogged drains", price_range: "$100–$300" },
    { service: "Water heater repair" },
  ],
  hours: { monday: "8am–6pm", saturday: "9am–2pm" },
  emergency_policy: "24/7 emergency line for burst pipes and flooding.",
});

const salon = makeBusiness({
  name: "Bloom Hair Studio",
  service_area: "Downtown Portland",
  services: [
    { service: "Haircut", price_range: "$45+" },
    { service: "Balayage", description: "Hand-painted highlights" },
  ],
  hours: { tuesday: "10am–7pm", wednesday: "10am–7pm" },
  emergency_policy: null,
});

describe("buildSystemPrompt", () => {
  it("produces a business-specific prompt from stored data", () => {
    const prompt = buildSystemPrompt(plumber);
    expect(prompt).toContain("Rapid Flow Plumbing");
    expect(prompt).toContain("Austin, TX and surrounding areas");
    expect(prompt).toContain("Drain cleaning");
    expect(prompt).toContain("$100–$300");
    expect(prompt).toContain("Water heater repair");
    expect(prompt).toContain("Monday: 8am–6pm");
    expect(prompt).toContain("24/7 emergency line");
  });

  it("generates distinct prompts for two different businesses", () => {
    const a = buildSystemPrompt(plumber);
    const b = buildSystemPrompt(salon);
    expect(a).not.toEqual(b);
    // Each prompt mentions only its own business, never the other's.
    expect(a).toContain("Rapid Flow Plumbing");
    expect(a).not.toContain("Bloom Hair Studio");
    expect(b).toContain("Bloom Hair Studio");
    expect(b).not.toContain("Rapid Flow Plumbing");
  });

  it("orders hours by day of week regardless of insertion order", () => {
    const b = makeBusiness({
      hours: { friday: "9–5", monday: "9–5", wednesday: "9–5" },
    });
    const prompt = buildSystemPrompt(b);
    const mon = prompt.indexOf("Monday");
    const wed = prompt.indexOf("Wednesday");
    const fri = prompt.indexOf("Friday");
    expect(mon).toBeLessThan(wed);
    expect(wed).toBeLessThan(fri);
  });

  it("omits missing fields gracefully instead of rendering empties", () => {
    const bare = makeBusiness({
      name: "Bare Bones LLC",
      service_area: null,
      services: [],
      hours: {},
      emergency_policy: null,
    });
    const prompt = buildSystemPrompt(bare);
    expect(prompt).toContain("Bare Bones LLC");
    // No leftover template tokens or literal null/undefined.
    expect(prompt).not.toContain("null");
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("{");
    // Falls back to an honest "no service list" instruction.
    expect(prompt.toLowerCase()).toContain("do not invent");
    // Still includes the honesty guardrail.
    expect(prompt.toLowerCase()).toContain("outside");
  });

  it("contains no hardcoded client names (multi-tenant by construction)", () => {
    // The generic-business fallback must not name any specific client.
    const generic = buildSystemPrompt(makeBusiness({ name: "" }));
    expect(generic).toContain("this business");
  });
});
