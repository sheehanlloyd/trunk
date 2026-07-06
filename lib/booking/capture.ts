import {
  type BookingDetails,
  type RequiredBookingField,
  REQUIRED_BOOKING_FIELDS,
} from "./types";

/**
 * The reusable booking-capture module (design §9). It owns:
 *  - what a complete booking requires (`missingBookingFields`, `isBookingComplete`),
 *  - persisting a confirmed booking (`createBooking`),
 *  - saving partial info so it's never lost (`upsertLead` / `clearLead`).
 *
 * It is deliberately transport-free: it takes plain data and a business/
 * conversation id, so the Twilio voice flow in Phase 6 reuses it verbatim.
 * All writes use the service-role client (chat/voice are unauthenticated) and
 * are always scoped by `business_id`. The admin client is imported lazily inside
 * each function so this module's pure helpers stay importable (e.g. in unit
 * tests) without triggering eager env validation.
 */

/** A phone is "usable" if it carries at least 7 digits (loose, i18n-friendly). */
export function isUsablePhone(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7;
}

/**
 * Returns the required fields still missing from `details`. Phone must not only
 * be present but look like a real number, so the model can't "complete" a
 * booking with a placeholder.
 */
export function missingBookingFields(
  details: Partial<BookingDetails>,
): RequiredBookingField[] {
  return REQUIRED_BOOKING_FIELDS.filter((field) => {
    const value = details[field]?.trim();
    if (!value) return true;
    if (field === "phone") return !isUsablePhone(value);
    return false;
  });
}

/** True when every required field is present and valid. */
export function isBookingComplete(details: Partial<BookingDetails>): boolean {
  return missingBookingFields(details).length === 0;
}

/** Normalizes a partial detail set into trimmed strings / nulls for storage. */
function toRow(details: Partial<BookingDetails>) {
  const clean = (v: string | undefined) => {
    const t = v?.trim();
    return t ? t : null;
  };
  return {
    customer_name: clean(details.name),
    customer_phone: clean(details.phone),
    requested_service: clean(details.service),
    preferred_time: clean(details.preferredTime),
    notes: clean(details.notes),
  };
}

/**
 * Creates a booking row linked to its conversation. Caller must have already
 * validated completeness with `isBookingComplete`. Returns the new booking id.
 *
 * At most one booking per conversation (unique index on `conversation_id`,
 * migration 0009) — so a retried turn (e.g. Twilio re-POSTing the same
 * `/api/voice/gather` request) that tries to create a second booking for a
 * conversation that already has one resolves to the existing row instead of
 * inserting a duplicate. `created: false` tells the caller not to re-fire the
 * owner notification for a booking that already exists.
 */
export async function createBooking(args: {
  businessId: string;
  conversationId: string;
  details: BookingDetails;
}): Promise<{ bookingId: string; created: boolean }> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      business_id: args.businessId,
      conversation_id: args.conversationId,
      status: "new",
      ...toRow(args.details),
    })
    .select("id")
    .single<{ id: string }>();

  if (!error && data) {
    return { bookingId: data.id, created: true };
  }

  // 23505 = unique_violation: a booking for this conversation already exists
  // (a retried webhook delivery). Look it up instead of failing the turn.
  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await supabase
      .from("bookings")
      .select("id")
      .eq("conversation_id", args.conversationId)
      .single<{ id: string }>();

    if (!lookupError && existing) {
      return { bookingId: existing.id, created: false };
    }
  }

  throw new Error(`Failed to create booking: ${error?.message ?? "no row"}`);
}

/**
 * Saves (or refreshes) the partial info captured so far as a lead, so an
 * abandoned or unqualified conversation is never discarded (design §12). One
 * lead per conversation — upsert on `conversation_id` replaces the prior partial.
 */
export async function upsertLead(args: {
  businessId: string;
  conversationId: string;
  partial: Partial<BookingDetails>;
  reason: string;
}): Promise<{ leadId: string }> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .upsert(
      {
        business_id: args.businessId,
        conversation_id: args.conversationId,
        reason: args.reason,
        ...toRow(args.partial),
      },
      { onConflict: "conversation_id" },
    )
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(`Failed to upsert lead: ${error?.message ?? "no row"}`);
  }
  return { leadId: data.id };
}

/**
 * Removes the lead for a conversation once it has converted into a real
 * booking, so a completed booking doesn't also linger as an open lead.
 */
export async function clearLead(conversationId: string): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("conversation_id", conversationId);
  if (error) {
    // Non-fatal: the booking already succeeded. Log and move on.
    console.error("[booking] failed to clear lead", error);
  }
}
