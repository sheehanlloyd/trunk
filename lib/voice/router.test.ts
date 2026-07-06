import { describe, expect, it } from "vitest";

import { decideVoiceNext, nextAttempts } from "./router";

const base = {
  hasSpeech: true,
  attempts: 0,
  emergency: false,
  needsClarification: false,
};

describe("decideVoiceNext", () => {
  it("understood speech continues the conversation", () => {
    expect(decideVoiceNext(base)).toBe("continue");
  });

  it("an emergency always wins, even with no speech or at the attempt limit", () => {
    expect(decideVoiceNext({ ...base, emergency: true })).toBe("emergency");
    expect(
      decideVoiceNext({ ...base, hasSpeech: false, attempts: 5, emergency: true }),
    ).toBe("emergency");
  });

  it("no speech reprompts under the limit, then falls back to voicemail (2 attempts)", () => {
    expect(decideVoiceNext({ ...base, hasSpeech: false, attempts: 0 })).toBe(
      "reprompt",
    );
    expect(decideVoiceNext({ ...base, hasSpeech: false, attempts: 1 })).toBe(
      "voicemail",
    );
  });

  it("still-unclear speech clarifies under the limit, then voicemail (2 attempts)", () => {
    expect(
      decideVoiceNext({ ...base, needsClarification: true, attempts: 0 }),
    ).toBe("clarify");
    expect(
      decideVoiceNext({ ...base, needsClarification: true, attempts: 1 }),
    ).toBe("voicemail");
  });

  it("uses the per-turn clarification signal, not a sticky flag", () => {
    // A later understood turn recovers even after an earlier unclear one.
    expect(
      decideVoiceNext({ ...base, needsClarification: false, attempts: 1 }),
    ).toBe("continue");
  });
});

describe("nextAttempts", () => {
  it("increments on a failed turn and resets on progress", () => {
    expect(nextAttempts("reprompt", 0)).toBe(1);
    expect(nextAttempts("clarify", 1)).toBe(2);
    expect(nextAttempts("continue", 3)).toBe(0);
    expect(nextAttempts("emergency", 3)).toBe(0);
    expect(nextAttempts("voicemail", 1)).toBe(0);
  });
});
