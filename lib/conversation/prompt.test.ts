import { describe, expect, it } from "vitest";

import type { Business, KnowledgeCorrection } from "@/lib/types/database";

import { buildConversationSystemPrompt } from "./prompt";

/** Minimal business factory — overrides merged over sensible defaults. */
function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Rapid Flow Plumbing",
    owner_email: "owner@test.co",
    phone_number: null,
    service_area: "Austin, TX",
    services: [{ service: "Drain cleaning", price_range: "$100–$300" }],
    hours: { monday: "8am–6pm" },
    emergency_policy: null,
    raw_scraped_content: null,
    status: "active",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    average_job_value_cents: null,
    notification_preferences: { channels: ["sms"], daily_digest: true },
    grace_period_ends_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function correction(overrides: Partial<KnowledgeCorrection>): KnowledgeCorrection {
  return {
    id: "c0000000-0000-0000-0000-000000000000",
    business_id: "00000000-0000-0000-0000-000000000000",
    original_content: null,
    corrected_content: null,
    created_by: null,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildConversationSystemPrompt", () => {
  it("layers the booking protocol and edge-case rules over the base prompt", () => {
    const prompt = buildConversationSystemPrompt(makeBusiness(), "chat");
    expect(prompt).toContain("Rapid Flow Plumbing");
    expect(prompt).toContain("## Booking");
    expect(prompt).toContain("## Rules");
  });

  it("omits the corrections section when there are none", () => {
    const prompt = buildConversationSystemPrompt(makeBusiness(), "chat");
    expect(prompt).not.toContain("Owner corrections");
  });

  it("folds in an owner correction as an authoritative override", () => {
    const prompt = buildConversationSystemPrompt(makeBusiness(), "chat", [
      correction({
        original_content: "We charge $50 for a drain cleaning",
        corrected_content: "Drain cleaning starts at $150, not $50.",
      }),
    ]);
    expect(prompt).toContain("Owner corrections (authoritative");
    expect(prompt).toContain("We charge $50 for a drain cleaning");
    expect(prompt).toContain("Drain cleaning starts at $150, not $50.");
  });

  it("renders a correction with no original as a plain fact", () => {
    const prompt = buildConversationSystemPrompt(makeBusiness(), "voice", [
      correction({ corrected_content: "We now offer tankless installs." }),
    ]);
    expect(prompt).toContain("- We now offer tankless installs.");
    expect(prompt).not.toContain("Regarding \"\"");
  });

  it("ignores empty corrections", () => {
    const prompt = buildConversationSystemPrompt(makeBusiness(), "chat", [
      correction({ corrected_content: "   " }),
      correction({ corrected_content: null }),
    ]);
    expect(prompt).not.toContain("Owner corrections");
  });
});
