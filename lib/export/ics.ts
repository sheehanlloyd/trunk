/**
 * Pure iCalendar (RFC 5545) serialization for the per-booking "Add to
 * calendar" export. No I/O, no deps — unit tested in ics.test.ts.
 *
 * Placement honesty (same reasoning as BookingsCalendar): `preferred_time` is
 * free text the AI captured ("tomorrow morning") and can't be parsed into a
 * real start time, so the event is an all-day *follow-up reminder* on the day
 * after the booking was captured, with the customer's own timing words in the
 * description. The owner schedules the real job; this keeps it from slipping.
 */

import type { Booking } from "@/lib/types/database";

/** The slice of a booking row the ICS export needs. */
export type BookingIcsInput = Pick<
  Booking,
  | "id"
  | "customer_name"
  | "customer_phone"
  | "requested_service"
  | "preferred_time"
  | "notes"
  | "created_at"
>;

const MS_PER_DAY = 86_400_000;

const encoder = new TextEncoder();

/** Escapes TEXT values per RFC 5545 §3.3.11: backslash first, then structural
 *  characters; real newlines become the literal `\n` sequence. */
function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds one content line at 75 octets (§3.1): continuation lines start with a
 * single space that counts toward their own 75-octet budget. Folding is
 * measured in UTF-8 octets, not characters, and never splits a character.
 */
function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const physical: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const charOctets = encoder.encode(char).length;
    if (octets + charOctets > 75) {
      physical.push(current);
      current = " ";
      octets = 1;
    }
    current += char;
    octets += charOctets;
  }
  physical.push(current);
  return physical.join("\r\n");
}

/** "YYYYMMDD" (UTC) — the VALUE=DATE form used by all-day events. */
function toIcsDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");
}

/** "YYYYMMDDTHHMMSSZ" (UTC) — the DATE-TIME form used by DTSTAMP. */
function toIcsDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replaceAll(/[-:]/g, "") + "Z";
}

/**
 * Serializes one booking into a complete VCALENDAR document: a single all-day
 * VEVENT on the day after `created_at` ("follow up on this job"), CRLF line
 * endings, lines folded at 75 octets, trailing CRLF. DTSTAMP is derived from
 * `created_at` (not "now") so output is deterministic and cache-friendly.
 */
export function bookingToIcs(
  booking: BookingIcsInput,
  businessName: string,
): string {
  const createdMs = new Date(booking.created_at).getTime();
  // All-day events use an exclusive DTEND: [created + 1 day, created + 2 days)
  // renders as exactly one day in every calendar app.
  const startMs = createdMs + MS_PER_DAY;

  const service = booking.requested_service ?? "Job";
  const customer = booking.customer_name ?? "Unknown customer";

  const descriptionParts: string[] = [];
  if (booking.preferred_time) {
    descriptionParts.push(`Customer asked for: ${booking.preferred_time}`);
  }
  if (booking.customer_phone) {
    descriptionParts.push(`Phone: ${booking.customer_phone}`);
  }
  if (booking.notes) {
    descriptionParts.push(`Notes: ${booking.notes}`);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//trunk//AI Receptionist//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(businessName)}`,
    "BEGIN:VEVENT",
    `UID:${booking.id}@trunk`,
    `DTSTAMP:${toIcsDateTime(createdMs)}`,
    `DTSTART;VALUE=DATE:${toIcsDate(startMs)}`,
    `DTEND;VALUE=DATE:${toIcsDate(startMs + MS_PER_DAY)}`,
    `SUMMARY:${escapeText(`${service} — ${customer}`)}`,
    // A booking with no timing words, phone, or notes has nothing to describe.
    ...(descriptionParts.length > 0
      ? [`DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
