"use server";

import { revalidatePath } from "next/cache";

import { getCurrentBusiness } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  BookingStatus,
  NotificationPreferences,
  NotificationType,
  ServiceItem,
} from "@/lib/types/database";

/**
 * Server Actions for the dashboard (design §4–§6). Every action runs on the
 * server, re-checks auth itself (they're reachable by direct POST), and mutates
 * through the cookie-scoped Supabase client so RLS enforces tenant isolation —
 * the same guarantee the read pages rely on. We additionally scope writes by
 * business_id for clear errors and defense in depth.
 */

export type ActionResult = { ok: boolean; error?: string };

const BOOKING_STATUSES: BookingStatus[] = [
  "new",
  "confirmed",
  "owner_contacted",
  "canceled",
];

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/** Parses the client's services JSON into clean ServiceItem[], dropping empties. */
function parseServices(raw: FormDataEntryValue | null): ServiceItem[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry): ServiceItem | null => {
      if (!entry || typeof entry !== "object") return null;
      const o = entry as Record<string, unknown>;
      const service = typeof o.service === "string" ? o.service.trim() : "";
      if (!service) return null;
      const item: ServiceItem = { service };
      if (typeof o.description === "string" && o.description.trim()) {
        item.description = o.description.trim();
      }
      if (typeof o.price_range === "string" && o.price_range.trim()) {
        item.price_range = o.price_range.trim();
      }
      return item;
    })
    .filter((x): x is ServiceItem => x !== null);
}

/** Dollars string ("350", "350.50") -> integer cents, or null when blank. */
function parseAverageJobValueCents(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

function textOrNull(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * One-tap booking status change (design §5). Called directly from a client
 * component onClick, not a form, so it takes explicit args.
 */
export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };
  if (!BOOKING_STATUSES.includes(status)) {
    return { ok: false, error: "Unknown status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("business_id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Saves the business's AI context (design §6 / §11): the exact fields the AI
 * relies on, plus the average job value used by the dashboard revenue card.
 * Shaped for `useActionState`.
 */
export async function saveBusinessSettings(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const name = textOrNull(formData.get("name"));
  if (!name) return { ok: false, error: "Business name is required." };

  const hours: Record<string, string> = {};
  for (const day of DAYS) {
    const value = textOrNull(formData.get(`hours_${day}`));
    if (value) hours[day] = value;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      service_area: textOrNull(formData.get("service_area")),
      services: parseServices(formData.get("services_json")),
      hours,
      emergency_policy: textOrNull(formData.get("emergency_policy")),
      average_job_value_cents: parseAverageJobValueCents(
        formData.get("average_job_value"),
      ),
    })
    .eq("id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Saves notification channel + digest preferences (design §12), plus the
 * owner's mobile number for real SMS delivery (audit fix, item 2 —
 * `lib/notifications/send.ts` falls back to email without one, but we still
 * reject the save outright when SMS is selected with no usable number so the
 * gap is caught here rather than discovered later as a silently-skipped text).
 * Instant alerts for bookings/emergencies are fixed policy and not stored here.
 */
export async function saveNotificationPreferences(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const selected = formData.getAll("channels");
  const channels = (["sms", "email"] as NotificationType[]).filter((c) =>
    selected.includes(c),
  );
  const ownerPhone = textOrNull(formData.get("owner_phone"));

  if (channels.includes("sms") && (!ownerPhone || ownerPhone.replace(/\D/g, "").length < 7)) {
    return {
      ok: false,
      error: "Add a mobile number above so we have somewhere to text you.",
    };
  }

  const prefs: NotificationPreferences = {
    channels,
    daily_digest: formData.get("daily_digest") != null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ notification_preferences: prefs, owner_phone: ownerPhone })
    .eq("id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Records an owner correction (design §12). This is the write half of the AI
 * feedback loop: `handleTurn` folds these into every future turn's prompt, so
 * the fix takes effect on the next customer message. `created_by` is the
 * membership id, satisfying the knowledge_corrections_insert RLS check.
 */
export async function submitCorrection(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const corrected = textOrNull(formData.get("corrected_content"));
  if (!corrected) {
    return { ok: false, error: "Enter the correct answer before saving." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_corrections").insert({
    business_id: context.business.id,
    original_content: textOrNull(formData.get("original_content")),
    corrected_content: corrected,
    created_by: context.membership.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/knowledge");
  return { ok: true };
}
