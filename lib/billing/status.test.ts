import { describe, expect, it } from "vitest";

import { isPaused, isServiceLive } from "./status";

const NOW = new Date("2026-07-05T12:00:00Z");
const PAST = new Date("2026-07-01T12:00:00Z").toISOString(); // grace already ended
const FUTURE = new Date("2026-07-10T12:00:00Z").toISOString(); // still in grace

describe("isPaused / isServiceLive", () => {
  it("serves for trial and active regardless of grace field", () => {
    expect(isPaused("trial", null, NOW)).toBe(false);
    expect(isPaused("active", FUTURE, NOW)).toBe(false);
    expect(isServiceLive("active", null, NOW)).toBe(true);
  });

  it("keeps serving a past_due business while inside its grace window", () => {
    expect(isPaused("past_due", FUTURE, NOW)).toBe(false);
    expect(isServiceLive("past_due", FUTURE, NOW)).toBe(true);
  });

  it("stops serving a past_due business once grace has elapsed (lazy gate)", () => {
    expect(isPaused("past_due", PAST, NOW)).toBe(true);
    expect(isServiceLive("past_due", PAST, NOW)).toBe(false);
  });

  it("treats past_due with no grace timestamp as still serving (fail-open until set)", () => {
    expect(isPaused("past_due", null, NOW)).toBe(false);
  });

  it("always pauses an explicitly paused business", () => {
    expect(isPaused("paused", null, NOW)).toBe(true);
    expect(isPaused("paused", FUTURE, NOW)).toBe(true);
  });

  it("does not treat canceled as paused (service simply has no subscription)", () => {
    // Canceled businesses are handled by the dashboard/checkout flow, not the
    // paused gate; the widget gate only blocks genuine pause states.
    expect(isPaused("canceled", null, NOW)).toBe(false);
  });
});
