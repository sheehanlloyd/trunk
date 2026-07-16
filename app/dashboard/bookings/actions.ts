"use server";

import { revalidatePath } from "next/cache";

import { getCurrentBusiness } from "@/lib/auth/session";
import { dispatchSms } from "@/lib/notifications/adapters";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types/database";

/**
 * Server Actions for owner→customer SMS from a booking card (v2): the one-tap
 * review request and the free-text follow-up. Both re-check auth themselves,
 * load the booking through the cookie-scoped client (RLS proves it belongs to
 * this tenant), send via the shared Twilio adapter, and record the attempt in
 * `notifications_log` via the service role — the same audit trail owner alerts
 * use, distinguished by `reason` ('review_request' / 'owner_follow_up') and a
 * `related_booking_id`.
 */

export type ActionResult = { ok: boolean; error?: string };

/** Max length of an owner-written follow-up text (2 SMS segments, roughly). */
const FOLLOW_UP_MAX_CHARS = 320;

/** Statuses that mean "the job actually happened / is happening". */
const REVIEWABLE_STATUSES: Booking["status"][] = ["confirmed", "owner_contacted"];

/** Loads a booking, RLS-scoped to the caller's tenant. Null when not found. */
async function getOwnBooking(
  bookingId: string,
  businessId: string,
): Promise<Booking | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("business_id", businessId)
    .maybeSingle<Booking>();
  return data;
}

/** Records one customer-SMS attempt in the shared notifications audit log. */
async function logCustomerSms(
  businessId: string,
  bookingId: string,
  ok: boolean,
  reason: "review_request" | "owner_follow_up",
): Promise<void> {
  const { error } = await createAdminClient().from("notifications_log").insert({
    business_id: businessId,
    type: "sms",
    related_booking_id: bookingId,
    status: ok ? "sent" : "failed",
    reason,
  });
  if (error) {
    console.error("[bookings] failed to write notifications_log", error);
  }
}

/**
 * Texts the booking's customer a link to leave a review. Only makes sense once
 * the owner has actually handled the job (confirmed / contacted), and only ever
 * fires once per booking — repeat taps are refused, so a customer can never be
 * spammed with review nags.
 */
export async function sendReviewRequest(
  bookingId: string,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };
  const { business } = context;

  if (!business.review_link) {
    return {
      ok: false,
      error: "Add your review link in Settings to enable review requests.",
    };
  }

  const booking = await getOwnBooking(bookingId, business.id);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (!booking.customer_phone) {
    return { ok: false, error: "This booking has no customer phone number." };
  }
  if (!REVIEWABLE_STATUSES.includes(booking.status)) {
    return {
      ok: false,
      error: "Confirm or contact the customer before requesting a review.",
    };
  }

  // Spam guard: one review request per booking, ever. Checks for a prior
  // *sent* row so a failed delivery can be retried.
  const { data: prior } = await createAdminClient()
    .from("notifications_log")
    .select("id")
    .eq("business_id", business.id)
    .eq("related_booking_id", booking.id)
    .eq("reason", "review_request")
    .eq("status", "sent")
    .limit(1);
  if (prior && prior.length > 0) {
    return { ok: false, error: "Review request already sent for this booking." };
  }

  const body =
    `Thanks for choosing ${business.name}! ` +
    `If we did a good job, we'd really appreciate a quick review: ${business.review_link}`;

  let sent = false;
  try {
    sent = await dispatchSms({ to: booking.customer_phone, body });
  } catch (err) {
    console.error("[bookings] review request send threw", err);
    sent = false;
  }
  await logCustomerSms(business.id, booking.id, sent, "review_request");

  if (!sent) {
    return { ok: false, error: "Couldn't send the text. Please try again." };
  }

  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

/**
 * Sends the owner's own short message to the booking's customer — "running 20
 * min late", "tech is on the way", etc. Free text, capped at two SMS segments.
 */
export async function sendFollowUp(
  bookingId: string,
  message: string,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };
  const { business } = context;

  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Write a message before sending." };
  }
  if (trimmed.length > FOLLOW_UP_MAX_CHARS) {
    return {
      ok: false,
      error: `Keep it under ${FOLLOW_UP_MAX_CHARS} characters (currently ${trimmed.length}).`,
    };
  }

  const booking = await getOwnBooking(bookingId, business.id);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (!booking.customer_phone) {
    return { ok: false, error: "This booking has no customer phone number." };
  }

  let sent = false;
  try {
    sent = await dispatchSms({ to: booking.customer_phone, body: trimmed });
  } catch (err) {
    console.error("[bookings] follow-up send threw", err);
    sent = false;
  }
  await logCustomerSms(business.id, booking.id, sent, "owner_follow_up");

  if (!sent) {
    return { ok: false, error: "Couldn't send the text. Please try again." };
  }

  revalidatePath("/dashboard/bookings");
  return { ok: true };
}
