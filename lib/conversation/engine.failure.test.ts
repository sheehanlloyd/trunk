import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Business, Conversation, ConversationTurn } from "@/lib/types/database";

/**
 * Audit fix (item 1): a Claude/model-call failure must NEVER lose the
 * customer's message. This is an integration-style test (unlike the rest of
 * this directory's pure-function tests) because that's exactly what needs
 * proving: that `handleTurn` durably writes the customer's turn, not just
 * that its in-memory decision logic is correct.
 *
 * Mocked at the engine's direct dependencies — `./persistence` and
 * `@/lib/booking/capture` — rather than two layers down at
 * `@/lib/supabase/admin`. Each of those modules independently does its own
 * lazy `await import("@/lib/supabase/admin")`, and firing several of those
 * concurrently (via the `Promise.all` in `handleTurn`) for the first time
 * hits a first-resolution race in Vitest's module runner; mocking one layer
 * up avoids that entirely and is the more natural unit boundary anyway.
 */

const state = vi.hoisted(() => ({
  business: {
    id: "biz-1",
    name: "Acme Plumbing",
    owner_email: "owner@acme.test",
    owner_phone: null,
    phone_number: null,
    service_area: "Austin, TX",
    services: [],
    hours: {},
    emergency_policy: null,
    raw_scraped_content: null,
    status: "active",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    average_job_value_cents: null,
    notification_preferences: { channels: [] as string[], daily_digest: false },
    grace_period_ends_at: null,
    call_routing_mode: "direct",
    created_at: new Date().toISOString(),
  } as unknown as Business,
  conversation: {
    id: "convo-1",
    business_id: "biz-1",
    channel: "chat",
    customer_name: null as string | null,
    customer_phone: null as string | null,
    transcript: [] as ConversationTurn[],
    outcome: null,
    ai_confidence_flag: false,
    call_sid: null,
    created_at: new Date().toISOString(),
  } as Conversation,
  conversationUpdates: [] as Record<string, unknown>[],
  leadUpserts: [] as Record<string, unknown>[],
}));

vi.mock("./persistence", () => ({
  getBusiness: vi.fn(async () => state.business),
  getKnowledgeCorrections: vi.fn(async () => []),
  loadOrCreateConversation: vi.fn(async () => state.conversation),
  saveConversation: vi.fn(async (_id: string, update: Record<string, unknown>) => {
    state.conversationUpdates.push(update);
    Object.assign(state.conversation, {
      transcript: update.transcript,
      outcome: update.outcome,
      customer_name: update.customerName,
      customer_phone: update.customerPhone,
      ai_confidence_flag: update.aiConfidenceFlag,
    });
  }),
}));

vi.mock("@/lib/booking/capture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/capture")>();
  return {
    // Pure helpers keep their real implementation.
    isBookingComplete: actual.isBookingComplete,
    isUsablePhone: actual.isUsablePhone,
    createBooking: vi.fn(async () => ({ bookingId: "booking-1", created: true })),
    upsertLead: vi.fn(async (args: Record<string, unknown>) => {
      state.leadUpserts.push(args);
      return { leadId: "lead-1" };
    }),
    clearLead: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/ai/anthropic", () => ({
  CLAUDE_MODEL: "test-claude-model",
  VOICE_CLAUDE_MODEL: "test-voice-model",
  getAnthropic: () => ({
    messages: {
      parse: async () => {
        throw new Error("simulated Anthropic outage");
      },
    },
  }),
}));

beforeEach(() => {
  state.conversation = {
    id: "convo-1",
    business_id: "biz-1",
    channel: "chat",
    customer_name: null,
    customer_phone: null,
    transcript: [],
    outcome: null,
    ai_confidence_flag: false,
    call_sid: null,
    created_at: new Date().toISOString(),
  };
  state.conversationUpdates = [];
  state.leadUpserts = [];
});

describe("handleTurn — model-call failure never loses the customer's message", () => {
  it("persists the customer's turn to the transcript BEFORE the model call, and survives when it fails", async () => {
    const { handleTurn } = await import("./engine");

    const result = await handleTurn({
      businessId: "biz-1",
      conversationId: null,
      message: "Hi, do you fix AC units?",
      channel: "chat",
    });

    // The engine must not throw — it returns a valid, channel-appropriate result.
    expect(result.reply).toMatch(/something went wrong/i);
    expect(result.outcome).toBe("unclear");
    expect(result.aiConfidenceFlag).toBe(true);
    expect(result.bookingId).toBeNull();

    // At least two writes happened: the immediate pre-model save, and the
    // post-failure save. The FIRST one (before the model was ever called)
    // must already contain the customer's message.
    expect(state.conversationUpdates.length).toBeGreaterThanOrEqual(2);
    const firstWrite = state.conversationUpdates[0];
    const firstTranscript = firstWrite.transcript as ConversationTurn[];
    expect(firstTranscript).toEqual([
      { role: "customer", text: "Hi, do you fix AC units?" },
    ]);

    // The FINAL persisted state must still contain the customer's message
    // (not silently dropped) plus a spoken/written apology, and an accurate
    // non-null outcome — never left empty.
    const lastWrite = state.conversationUpdates[state.conversationUpdates.length - 1];
    const finalTranscript = lastWrite.transcript as ConversationTurn[];
    expect(
      finalTranscript.some(
        (t) => t.role === "customer" && t.text === "Hi, do you fix AC units?",
      ),
    ).toBe(true);
    expect(finalTranscript.some((t) => t.role === "assistant")).toBe(true);
    expect(lastWrite.outcome).toBe("unclear");
  });

  it("uses a spoken, reprompt-style apology for voice (preserves the 2-attempt voicemail fallback)", async () => {
    const { handleTurn } = await import("./engine");

    const result = await handleTurn({
      businessId: "biz-1",
      conversationId: null,
      message: "my heat isn't working",
      channel: "voice",
    });

    expect(result.reply).toBe("Sorry, I didn't quite catch that. Could you say that again?");
    expect(result.needsClarification).toBe(true); // drives lib/voice/router.ts's reprompt/voicemail logic
  });

  it("does NOT create a lead when nothing savable was known yet (brand-new conversation)", async () => {
    const { handleTurn } = await import("./engine");

    await handleTurn({
      businessId: "biz-1",
      conversationId: null,
      message: "hello?",
      channel: "chat",
    });

    expect(state.leadUpserts).toHaveLength(0);
  });

  it("saves a lead (reason: engine_error) from contact info an EARLIER turn already captured", async () => {
    // Simulate a conversation already in progress: an earlier successful turn
    // captured the customer's name before this turn's model call fails.
    state.conversation = {
      ...state.conversation,
      customer_name: "Dana Rivera",
      customer_phone: "+15551230000",
      transcript: [{ role: "customer", text: "My AC stopped cooling, I'm Dana" }],
    };

    const { handleTurn } = await import("./engine");

    const result = await handleTurn({
      businessId: "biz-1",
      conversationId: "convo-1",
      message: "can someone come tomorrow?",
      channel: "chat",
    });

    expect(result.outcome).toBe("unclear");
    expect(state.leadUpserts).toHaveLength(1);
    expect(state.leadUpserts[0]).toMatchObject({
      businessId: "biz-1",
      conversationId: "convo-1",
      reason: "engine_error",
      partial: { name: "Dana Rivera", phone: "+15551230000" },
    });

    // Both the earlier turn's message AND this turn's message must both
    // still be present in the final transcript — neither is lost.
    const lastWrite = state.conversationUpdates[state.conversationUpdates.length - 1];
    const finalTranscript = lastWrite.transcript as ConversationTurn[];
    expect(finalTranscript.map((t) => t.text)).toEqual([
      "My AC stopped cooling, I'm Dana",
      "can someone come tomorrow?",
      "Sorry — something went wrong on our end. Please try again, or leave your name and phone number and we'll follow up.",
    ]);
  });

  it("never downgrades a stickier prior outcome (e.g. already booked) when a LATER turn's model call fails", async () => {
    state.conversation = {
      ...state.conversation,
      outcome: "booked",
      transcript: [{ role: "customer", text: "yes that works, thank you" }],
    };

    const { handleTurn } = await import("./engine");

    const result = await handleTurn({
      businessId: "biz-1",
      conversationId: "convo-1",
      message: "actually one more question",
      channel: "chat",
    });

    // mergeOutcome keeps "booked" (rank 3) over "unclear" (rank 2).
    expect(result.outcome).toBe("booked");
  });
});
