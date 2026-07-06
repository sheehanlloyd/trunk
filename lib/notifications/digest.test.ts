import { describe, expect, it } from "vitest";

import {
  buildDigest,
  type DigestConversation,
  type DigestLead,
} from "./digest";

function convos(...outcomes: DigestConversation["outcome"][]): DigestConversation[] {
  return outcomes.map((outcome) => ({ outcome }));
}
function leads(...reasons: DigestLead["reason"][]): DigestLead[] {
  return reasons.map((reason) => ({ reason }));
}

describe("buildDigest", () => {
  it("reports no activity for an empty window so the caller can skip the send", () => {
    const d = buildDigest({ businessName: "Acme", conversations: [], leads: [] });
    expect(d.hasActivity).toBe(false);
    expect(d.counts.conversations).toBe(0);
  });

  it("has activity when there are leads but no conversations", () => {
    const d = buildDigest({
      businessName: "Acme",
      conversations: [],
      leads: leads("needs_callback"),
    });
    expect(d.hasActivity).toBe(true);
  });

  it("buckets outcomes into totals (booked/emergency/voicemail/answered)", () => {
    const d = buildDigest({
      businessName: "Acme",
      conversations: convos(
        "booked",
        "booked",
        "emergency_escalated",
        "voicemail_left",
        "no_action",
        "unclear",
        null,
      ),
      leads: [],
    });
    expect(d.counts.conversations).toBe(7);
    expect(d.counts.booked).toBe(2);
    expect(d.counts.emergencies).toBe(1);
    expect(d.counts.voicemails).toBe(1);
    // no_action + unclear + null all count as general "answered" activity.
    expect(d.counts.answered).toBe(3);
  });

  it("buckets leads by reason and mentions follow-up in the body", () => {
    const d = buildDigest({
      businessName: "Acme",
      conversations: convos("no_action"),
      leads: leads("incomplete", "needs_callback", "needs_callback", "out_of_area"),
    });
    expect(d.counts.leads).toBe(4);
    expect(d.counts.leadsByReason).toEqual({
      incomplete: 1,
      needs_callback: 2,
      out_of_area: 1,
    });
    expect(d.body).toMatch(/4 leads need follow-up/);
    expect(d.body).toContain("dashboard");
  });

  it("produces SMS-safe copy: no markdown, symbols, or URLs", () => {
    const d = buildDigest({
      businessName: "Acme",
      conversations: convos("booked", "no_action"),
      leads: leads("incomplete"),
    });
    expect(d.body).not.toMatch(/[*_#`|]|https?:\/\//);
    expect(d.subject).toBe("Daily summary — Acme");
  });

  it("singularizes counts of one", () => {
    const d = buildDigest({
      businessName: "Acme",
      conversations: convos("booked"),
      leads: leads("needs_callback"),
    });
    expect(d.body).toContain("handled 1 conversation ");
    expect(d.body).toContain("1 booking");
    expect(d.body).toContain("1 lead needs follow-up");
    expect(d.body).toContain("a callback request");
  });

  it("omits the leads sentence entirely when there are none", () => {
    const d = buildDigest({
      businessName: "Acme",
      conversations: convos("booked"),
      leads: [],
    });
    expect(d.body).not.toMatch(/follow-up/);
  });
});
