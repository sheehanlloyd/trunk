import { describe, expect, it } from "vitest";

import { bookingToIcs, type BookingIcsInput } from "./ics";

/** A minimal booking; tests override fields as needed. */
function makeBooking(overrides: Partial<BookingIcsInput> = {}): BookingIcsInput {
  return {
    id: "abc-123",
    customer_name: "Jane Doe",
    customer_phone: null,
    requested_service: "Drain cleaning",
    preferred_time: null,
    notes: null,
    created_at: "2026-08-10T14:30:00Z",
    ...overrides,
  };
}

describe("bookingToIcs", () => {
  it("emits a complete CRLF-terminated VCALENDAR with an all-day reminder the day after capture", () => {
    const ics = bookingToIcs(
      makeBooking({ preferred_time: "tomorrow morning" }),
      "Trunk Plumbing",
    );
    expect(ics).toBe(
      "BEGIN:VCALENDAR\r\n" +
        "VERSION:2.0\r\n" +
        "PRODID:-//trunk//AI Receptionist//EN\r\n" +
        "CALSCALE:GREGORIAN\r\n" +
        "METHOD:PUBLISH\r\n" +
        "X-WR-CALNAME:Trunk Plumbing\r\n" +
        "BEGIN:VEVENT\r\n" +
        "UID:abc-123@trunk\r\n" +
        "DTSTAMP:20260810T143000Z\r\n" +
        "DTSTART;VALUE=DATE:20260811\r\n" +
        "DTEND;VALUE=DATE:20260812\r\n" +
        "SUMMARY:Drain cleaning — Jane Doe\r\n" +
        "DESCRIPTION:Customer asked for: tomorrow morning\r\n" +
        "END:VEVENT\r\n" +
        "END:VCALENDAR\r\n",
    );
  });

  it("rolls the all-day date across month boundaries (exclusive DTEND)", () => {
    const ics = bookingToIcs(
      makeBooking({ created_at: "2026-08-31T23:59:59Z" }),
      "Trunk",
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260902\r\n");
    expect(ics).toContain("DTSTAMP:20260831T235959Z\r\n");
  });

  it("falls back to 'Job — Unknown customer' and omits DESCRIPTION when empty", () => {
    const ics = bookingToIcs(
      makeBooking({ customer_name: null, requested_service: null }),
      "Trunk",
    );
    expect(ics).toContain("SUMMARY:Job — Unknown customer\r\n");
    expect(ics).not.toContain("DESCRIPTION");
  });

  it("escapes commas, semicolons, backslashes, and newlines in TEXT values", () => {
    const ics = bookingToIcs(
      makeBooking({
        customer_name: "Bob; Jr",
        requested_service: "A/C, repair",
        preferred_time: "9am, sharp; A\\B",
      }),
      "Smith, Sons; Co",
    );
    expect(ics).toContain("SUMMARY:A/C\\, repair — Bob\\; Jr\r\n");
    expect(ics).toContain(
      "DESCRIPTION:Customer asked for: 9am\\, sharp\\; A\\\\B\r\n",
    );
    expect(ics).toContain("X-WR-CALNAME:Smith\\, Sons\\; Co\r\n");
  });

  it("joins description parts and embedded newlines with literal \\n", () => {
    const ics = bookingToIcs(
      makeBooking({
        preferred_time: "Friday",
        customer_phone: "5551234567",
        notes: "gate code 4;2\nring twice",
      }),
      "Trunk",
    );
    expect(ics).toContain(
      "DESCRIPTION:Customer asked for: Friday\\nPhone: 5551234567\\nNotes: gate code\r\n" +
        "  4\\;2\\nring twice\r\n",
    );
  });

  it("folds long lines at 75 octets with a leading space on continuations", () => {
    const ics = bookingToIcs(makeBooking({ notes: "a".repeat(100) }), "Trunk");
    // "DESCRIPTION:Notes: " is 19 octets, so 56 a's complete the first line.
    expect(ics).toContain(
      `DESCRIPTION:Notes: ${"a".repeat(56)}\r\n ${"a".repeat(44)}\r\n`,
    );
  });

  it("folds by UTF-8 octets, never splitting a multi-byte character", () => {
    const ics = bookingToIcs(makeBooking({ notes: "é".repeat(60) }), "Trunk");
    // Each "é" is 2 octets: 19 + 2×28 = 75 exactly, so the 29th wraps whole.
    expect(ics).toContain(
      `DESCRIPTION:Notes: ${"é".repeat(28)}\r\n ${"é".repeat(32)}\r\n`,
    );
  });
});
