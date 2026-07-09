"use server";

import { revalidatePath } from "next/cache";

import { getCurrentBusiness } from "@/lib/auth/session";
import { isUsablePhone } from "@/lib/booking/capture";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types/database";

/**
 * Server Actions for the Leads page. Same trust model as the dashboard actions:
 * each action re-checks auth itself (reachable by direct POST) and writes
 * through the cookie-scoped Supabase client so the leads_update RLS policy
 * (0011) enforces tenant isolation. We additionally scope by business_id for
 * clear errors and defense in depth.
 */

export type ActionResult = { ok: boolean; error?: string };

/** Shared implementation: resolving and reopening only differ in resolved_at. */
async function setLeadResolvedAt(
  leadId: string,
  resolvedAt: string | null,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ resolved_at: resolvedAt })
    .eq("id", leadId)
    .eq("business_id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/leads");
  return { ok: true };
}

/** Owner marked the lead handled (called back, booked, or written off). */
export async function markLeadResolved(leadId: string): Promise<ActionResult> {
  return setLeadResolvedAt(leadId, new Date().toISOString());
}

/** Puts a resolved lead back in the open list (e.g. the callback bounced). */
export async function reopenLead(leadId: string): Promise<ActionResult> {
  return setLeadResolvedAt(leadId, null);
}

/** Trims a form value to a string-or-null (empty and whitespace become null). */
function textOrNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

/**
 * Owner called the lead back and won the job — records it as a real booking.
 * Everything runs through the RLS client: the lead is fetched under leads_select,
 * the booking insert goes through the bookings_insert policy (0002 — tenants
 * may insert their own bookings, no admin client needed), and the resolve uses
 * leads_update (0011). Status starts at 'owner_contacted' because, unlike an
 * AI-captured booking, the owner has by definition already spoken to them.
 * Bound to the card's form via `.bind(null, leadId)`, shaped for useActionState.
 */
export async function convertLeadToBooking(
  leadId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("business_id", context.business.id)
    .maybeSingle<Lead>();

  if (!lead) return { ok: false, error: "Lead not found." };

  const customerName = textOrNull(formData.get("customer_name"));
  const customerPhone = textOrNull(formData.get("customer_phone"));
  const requestedService = textOrNull(formData.get("requested_service"));

  if (!customerName) {
    return { ok: false, error: "Customer name is required." };
  }
  if (customerPhone && !isUsablePhone(customerPhone)) {
    return { ok: false, error: "That phone number looks too short." };
  }
  if (!requestedService) {
    return { ok: false, error: "Enter the service they booked." };
  }

  const { error: insertError } = await supabase.from("bookings").insert({
    business_id: context.business.id,
    conversation_id: lead.conversation_id,
    status: "owner_contacted",
    customer_name: customerName,
    customer_phone: customerPhone,
    requested_service: requestedService,
    preferred_time: textOrNull(formData.get("preferred_time")),
    notes: textOrNull(formData.get("notes")),
  });

  if (insertError) {
    // 23505 = unique_violation on bookings.conversation_id (0009): this
    // conversation already converted — usually a double-tap or the AI booked
    // it after the lead was captured. Point at the existing booking instead
    // of surfacing a raw constraint error.
    if (insertError.code === "23505") {
      return {
        ok: false,
        error:
          "This conversation already has a booking — check the Bookings page.",
      };
    }
    return { ok: false, error: insertError.message };
  }

  // The lead converted; file it away. Best-effort ordering: if this update
  // failed the booking still exists, and the owner can "Mark handled" manually.
  const { error: resolveError } = await supabase
    .from("leads")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("business_id", context.business.id);

  if (resolveError) {
    return {
      ok: false,
      error: `Booking saved, but the lead couldn't be marked handled: ${resolveError.message}`,
    };
  }

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}
