import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationPreferences } from "@/lib/types/database";

/**
 * Audit fix (item 2): the "sms" channel must never silently report "sent"
 * when there's no phone number to send to — it must fall back to email and
 * log what actually happened.
 */

const state = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  emailCalls: [] as { to: string; subject: string; body: string }[],
  smsCalls: [] as { to: string; body: string }[],
  emailResult: true,
  smsResult: true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

vi.mock("./adapters", () => ({
  dispatchEmail: vi.fn(async (msg: { to: string; subject: string; body: string }) => {
    state.emailCalls.push(msg);
    return state.emailResult;
  }),
  dispatchSms: vi.fn(async (msg: { to: string; body: string }) => {
    state.smsCalls.push(msg);
    return state.smsResult;
  }),
}));

function business(overrides: {
  owner_phone?: string | null;
  channels?: NotificationPreferences["channels"];
}) {
  return {
    id: "biz-1",
    owner_email: "owner@acme.test",
    owner_phone: overrides.owner_phone ?? null,
    notification_preferences: {
      channels: overrides.channels ?? ["sms"],
      daily_digest: true,
    },
  };
}

beforeEach(() => {
  state.inserted = [];
  state.emailCalls = [];
  state.smsCalls = [];
  state.emailResult = true;
  state.smsResult = true;
});

describe("notifyOwner", () => {
  it("sends real SMS via the adapter when a usable owner_phone is on file", async () => {
    const { notifyOwner } = await import("./send");

    await notifyOwner({
      business: business({ owner_phone: "+15551234567", channels: ["sms"] }),
      reason: "booking",
      subject: "New booking",
      body: "Details...",
    });

    expect(state.smsCalls).toEqual([{ to: "+15551234567", body: "Details..." }]);
    expect(state.emailCalls).toHaveLength(0);
    expect(state.inserted).toEqual([
      { business_id: "biz-1", type: "sms", related_booking_id: null, status: "sent", reason: "booking" },
    ]);
  });

  it("falls back to email — and logs the fallback truthfully — when owner_phone is missing", async () => {
    const { notifyOwner } = await import("./send");

    await notifyOwner({
      business: business({ owner_phone: null, channels: ["sms"] }),
      reason: "emergency",
      subject: "Emergency call",
      body: "Details...",
    });

    // Never calls the SMS adapter with nowhere to send.
    expect(state.smsCalls).toHaveLength(0);
    // Sends a real email instead, so the owner still hears about it.
    expect(state.emailCalls).toHaveLength(1);
    expect(state.emailCalls[0].to).toBe("owner@acme.test");
    expect(state.emailCalls[0].subject).toContain("No phone on file");

    // The log records what ACTUALLY happened (email), never a fake "sms sent".
    expect(state.inserted).toEqual([
      { business_id: "biz-1", type: "email", related_booking_id: null, status: "sent", reason: "emergency" },
    ]);
  });

  it("also falls back to email when owner_phone is set but not a usable phone number", async () => {
    const { notifyOwner } = await import("./send");

    await notifyOwner({
      business: business({ owner_phone: "n/a", channels: ["sms"] }),
      reason: "booking",
      subject: "New booking",
      body: "Details...",
    });

    expect(state.smsCalls).toHaveLength(0);
    expect(state.emailCalls).toHaveLength(1);
    expect(state.inserted[0].type).toBe("email");
  });

  it("logs a failed SMS as failed (not a fallback) when a real phone number's send fails", async () => {
    state.smsResult = false;
    const { notifyOwner } = await import("./send");

    await notifyOwner({
      business: business({ owner_phone: "+15551234567", channels: ["sms"] }),
      reason: "booking",
      subject: "New booking",
      body: "Details...",
    });

    expect(state.smsCalls).toHaveLength(1);
    expect(state.emailCalls).toHaveLength(0);
    expect(state.inserted).toEqual([
      { business_id: "biz-1", type: "sms", related_booking_id: null, status: "failed", reason: "booking" },
    ]);
  });

  it("dispatches on every opted-in channel independently", async () => {
    const { notifyOwner } = await import("./send");

    await notifyOwner({
      business: business({ owner_phone: "+15551234567", channels: ["sms", "email"] }),
      reason: "booking",
      subject: "New booking",
      body: "Details...",
    });

    expect(state.smsCalls).toHaveLength(1);
    expect(state.emailCalls).toHaveLength(1);
    expect(state.inserted).toHaveLength(2);
  });

  it("falls back to email when every channel is turned off (billing alerts must never go silent)", async () => {
    const { notifyOwner } = await import("./send");

    await notifyOwner({
      business: business({ owner_phone: null, channels: [] }),
      reason: "billing_past_due",
      subject: "Payment problem",
      body: "Details...",
    });

    expect(state.emailCalls).toHaveLength(1);
    expect(state.inserted[0].type).toBe("email");
  });
});
