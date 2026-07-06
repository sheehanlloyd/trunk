import { describe, expect, it } from "vitest";

import { greetingTwiml } from "./twiml";

/**
 * Item 7 (design §12): the two Phase-6 call-routing modes must behave as
 * configured per business. Routing mode only changes the greeting framing (both
 * modes ring the Twilio number and then run the same engine), so this asserts the
 * greeting is correct and distinct for each mode.
 */
describe("greetingTwiml — call_routing_mode", () => {
  const actionUrl = "https://example.com/api/voice/gather?businessId=abc";

  it("direct mode greets as the primary line", () => {
    const xml = greetingTwiml({
      businessName: "Cool Breeze HVAC",
      mode: "direct",
      actionUrl,
    });
    expect(xml).toContain("Thanks for calling Cool Breeze HVAC.");
    expect(xml).toContain("I'm their virtual assistant. How can I help you today?");
    // Must not use the forward-specific "picking up so we don't miss you" framing.
    expect(xml).not.toContain("picking up so we don't miss you");
  });

  it("forward mode greets as the after-rings backup that caught the call", () => {
    const xml = greetingTwiml({
      businessName: "Rapid Response Plumbing",
      mode: "forward",
      actionUrl,
    });
    expect(xml).toContain("Thanks for calling Rapid Response Plumbing.");
    expect(xml).toContain("picking up so we don't miss you");
  });

  it("both modes open a speech gather pointed at the same action URL", () => {
    for (const mode of ["direct", "forward"] as const) {
      const xml = greetingTwiml({ businessName: "Acme", mode, actionUrl });
      expect(xml).toContain("<Gather");
      expect(xml).toContain('input="speech"');
      expect(xml).toContain(actionUrl.replace(/&/g, "&amp;"));
    }
  });
});
