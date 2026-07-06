import { describe, expect, it } from "vitest";

import {
  analysisToDetails,
  decide,
  hasSavableContact,
  mergeOutcome,
  outcomeRank,
} from "./engine";
import type { TurnAnalysis } from "./types";

/** Builds a TurnAnalysis with sensible defaults, overridable per test. */
function analysis(
  overrides: Partial<Omit<TurnAnalysis, "booking">> & {
    booking?: Partial<TurnAnalysis["booking"]>;
  } = {},
): TurnAnalysis {
  const { booking, ...rest } = overrides;
  return {
    reply: "ok",
    intent: "question",
    booking_confirmed: false,
    emergency_detected: false,
    out_of_area: false,
    needs_clarification: false,
    low_confidence: false,
    ...rest,
    booking: {
      name: "",
      phone: "",
      service: "",
      preferred_time: "",
      notes: "",
      ...(booking ?? {}),
    },
  };
}

const fullBooking = {
  name: "Jane",
  phone: "555-123-4567",
  service: "Drain cleaning",
  preferred_time: "Tomorrow AM",
  notes: "",
};

describe("outcomeRank / mergeOutcome", () => {
  it("ranks emergency highest and no_action lowest", () => {
    expect(outcomeRank("emergency_escalated")).toBeGreaterThan(outcomeRank("booked"));
    expect(outcomeRank("booked")).toBeGreaterThan(outcomeRank("unclear"));
    expect(outcomeRank("unclear")).toBeGreaterThan(outcomeRank("no_action"));
    expect(outcomeRank(null)).toBe(0);
  });

  it("never downgrades a stickier outcome", () => {
    expect(mergeOutcome("booked", "no_action")).toBe("booked");
    expect(mergeOutcome("no_action", "booked")).toBe("booked");
    expect(mergeOutcome("booked", "emergency_escalated")).toBe("emergency_escalated");
    expect(mergeOutcome(null, "no_action")).toBe("no_action");
  });
});

describe("analysisToDetails", () => {
  it("maps and trims the model's booking block", () => {
    const details = analysisToDetails(
      analysis({ booking: { ...fullBooking, name: "  Jane  " } }),
    );
    expect(details).toEqual({
      name: "Jane",
      phone: "555-123-4567",
      service: "Drain cleaning",
      preferredTime: "Tomorrow AM",
      notes: "",
    });
  });
});

describe("hasSavableContact", () => {
  it("is true with a name or a usable phone, false otherwise", () => {
    expect(hasSavableContact(analysisToDetails(analysis()))).toBe(false);
    expect(
      hasSavableContact(analysisToDetails(analysis({ booking: { name: "Jane" } }))),
    ).toBe(true);
    expect(
      hasSavableContact(
        analysisToDetails(analysis({ booking: { phone: "5551234567" } })),
      ),
    ).toBe(true);
  });
});

describe("decide", () => {
  it("books only when confirmed AND details validate", () => {
    const a = analysis({ booking: fullBooking, booking_confirmed: true });
    const d = decide(a, analysisToDetails(a));
    expect(d.outcome).toBe("booked");
    expect(d.createBooking).toBe(true);
    expect(d.leadReason).toBeNull();
  });

  it("does NOT book when the model claims confirmed but details are incomplete; flags low confidence + saves a lead", () => {
    const a = analysis({
      booking: { ...fullBooking, phone: "" }, // no phone
      booking_confirmed: true,
    });
    const d = decide(a, analysisToDetails(a));
    expect(d.createBooking).toBe(false);
    expect(d.outcome).toBe("no_action");
    expect(d.leadReason).toBe("incomplete"); // has a name -> savable
    expect(d.aiConfidenceFlag).toBe(true); // claimed-but-incomplete
  });

  it("routes emergencies above everything, no booking or lead", () => {
    const a = analysis({
      emergency_detected: true,
      booking: fullBooking,
      booking_confirmed: true,
    });
    const d = decide(a, analysisToDetails(a));
    expect(d.outcome).toBe("emergency_escalated");
    expect(d.createBooking).toBe(false);
    expect(d.leadReason).toBeNull();
  });

  it("marks out-of-area as no_action and saves a lead when contact is known", () => {
    const a = analysis({ out_of_area: true, booking: { name: "Jane" } });
    const d = decide(a, analysisToDetails(a));
    expect(d.outcome).toBe("no_action");
    expect(d.leadReason).toBe("out_of_area");
  });

  it("marks unclear and offers callback lead when contact is known", () => {
    const a = analysis({
      needs_clarification: true,
      booking: { phone: "5551234567" },
    });
    const d = decide(a, analysisToDetails(a));
    expect(d.outcome).toBe("unclear");
    expect(d.leadReason).toBe("needs_callback");
  });

  it("saves no lead for a plain question with no contact info", () => {
    const a = analysis({ intent: "question" });
    const d = decide(a, analysisToDetails(a));
    expect(d.outcome).toBe("no_action");
    expect(d.leadReason).toBeNull();
    expect(d.createBooking).toBe(false);
  });
});
