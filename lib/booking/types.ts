/**
 * Shared booking types. Channel-agnostic by design: chat (Phase 3) and voice
 * (Phase 6) both collect the same details and flow through the same module, so
 * booking logic is never duplicated per channel.
 */

/** The details a booking needs. Strings default to "" when not yet captured. */
export interface BookingDetails {
  name: string;
  phone: string;
  service: string;
  preferredTime: string;
  notes: string;
}

/**
 * Fields that must be present (and valid) before a booking can be created.
 * `notes` is optional — it enriches the booking but isn't required to make one.
 */
export const REQUIRED_BOOKING_FIELDS = [
  "name",
  "phone",
  "service",
  "preferredTime",
] as const satisfies readonly (keyof BookingDetails)[];

export type RequiredBookingField = (typeof REQUIRED_BOOKING_FIELDS)[number];
