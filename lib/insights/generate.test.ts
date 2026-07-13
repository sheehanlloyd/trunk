import { describe, expect, it } from "vitest";

import type { ConversationTurn, InsightContent } from "@/lib/types/database";

import {
  buildInsightsPrompt,
  InsightModelSchema,
  type InsightSourceConversation,
  MAX_CONVERSATIONS,
  MAX_TRANSCRIPT_TURNS,
  shouldRegenerate,
  transcriptExcerpt,
} from "./generate";

function turns(count: number): ConversationTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("customer" as const) : ("assistant" as const),
    text: `turn ${i}`,
  }));
}

function convo(
  overrides: Partial<InsightSourceConversation> = {},
): InsightSourceConversation {
  return {
    channel: "chat",
    outcome: "booked",
    created_at: "2026-08-10T14:00:00Z",
    transcript: turns(4),
    ...overrides,
  };
}

describe("transcriptExcerpt", () => {
  it("labels customer and assistant turns for the prompt", () => {
    const text = transcriptExcerpt([
      { role: "customer", text: "My AC is dead" },
      { role: "assistant", text: "I can help with that" },
    ]);
    expect(text).toBe("Customer: My AC is dead\nAI: I can help with that");
  });

  it("keeps only the most recent turns of a long chat", () => {
    const text = transcriptExcerpt(turns(50));
    expect(text.split("\n")).toHaveLength(MAX_TRANSCRIPT_TURNS);
    // The tail survives; the head is dropped.
    expect(text).toContain("turn 49");
    expect(text).not.toContain("turn 29\n");
  });

  it("is empty for an empty transcript rather than throwing", () => {
    expect(transcriptExcerpt([])).toBe("");
  });
});

describe("buildInsightsPrompt", () => {
  it("emits one numbered block per conversation with its metadata", () => {
    const prompt = buildInsightsPrompt([
      convo(),
      convo({ channel: "voice", outcome: null, created_at: "2026-08-11T09:00:00Z" }),
    ]);
    expect(prompt).toContain("2 recent customer conversations");
    expect(prompt).toContain("Conversation 1 (chat, outcome: booked, 2026-08-10)");
    expect(prompt).toContain("Conversation 2 (voice, outcome: none, 2026-08-11)");
    expect(prompt).toContain("Customer: turn 0");
  });

  it("caps the number of conversations defensively", () => {
    const prompt = buildInsightsPrompt(
      Array.from({ length: MAX_CONVERSATIONS + 20 }, () => convo()),
    );
    expect(prompt).toContain(`${MAX_CONVERSATIONS} recent customer conversations`);
    expect(prompt).not.toContain(`Conversation ${MAX_CONVERSATIONS + 1} (`);
  });
});

describe("InsightModelSchema", () => {
  it("accepts a full report and composes into InsightContent with code-computed stats", () => {
    const parsed = InsightModelSchema.parse({
      headline: "Most callers ask about weekend availability.",
      top_questions: [{ question: "Do you work weekends?", count: 4 }],
      gaps: ["No pricing info for water heater installs"],
      suggested_corrections: [
        { original: "I'm not sure about weekend hours", corrected: "We're open Sat 8-2" },
      ],
    });
    // The model never produces stats — they're merged in from real counts.
    const content: InsightContent = {
      ...parsed,
      stats: { conversations: 12, bookings: 3, leads: 2, emergencies: 1 },
    };
    expect(content.headline).toMatch(/weekend/);
    expect(content.top_questions[0].count).toBe(4);
  });

  it("allows empty lists for an unremarkable period", () => {
    const parsed = InsightModelSchema.parse({
      headline: "A quiet, well-handled month.",
      top_questions: [],
      gaps: [],
      suggested_corrections: [],
    });
    expect(parsed.gaps).toEqual([]);
  });

  it("rejects a report missing its headline", () => {
    expect(() =>
      InsightModelSchema.parse({
        top_questions: [],
        gaps: [],
        suggested_corrections: [],
      }),
    ).toThrow();
  });
});

describe("shouldRegenerate", () => {
  const now = Date.parse("2026-08-15T12:00:00Z");

  it("generates for a business that has never had a report", () => {
    expect(shouldRegenerate(null, now)).toBe(true);
  });

  it("skips a report generated yesterday", () => {
    expect(shouldRegenerate("2026-08-14T12:00:00Z", now)).toBe(false);
  });

  it("regenerates once the report is at least six days old", () => {
    // Exactly at the threshold — a weekly cron that drifts early must not skip.
    expect(shouldRegenerate("2026-08-09T12:00:00Z", now)).toBe(true);
    expect(shouldRegenerate("2026-08-09T12:00:01Z", now)).toBe(false);
  });

  it("regenerates rather than stalling on an unparseable timestamp", () => {
    expect(shouldRegenerate("not-a-date", now)).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(shouldRegenerate("2026-08-13T12:00:00Z", now, 1)).toBe(true);
    expect(shouldRegenerate("2026-08-13T12:00:00Z", now, 30)).toBe(false);
  });
});
