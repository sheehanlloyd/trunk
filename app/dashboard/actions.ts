"use server";

import { revalidatePath } from "next/cache";

import { getCurrentBusiness } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  BookingStatus,
  CallRoutingMode,
  NotificationPreferences,
  NotificationType,
  ServiceItem,
  WidgetConfig,
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

const CALL_ROUTING_MODES: CallRoutingMode[] = ["direct", "forward"];

/**
 * Normalizes a phone input to digits (with an optional leading +). Returns
 * `{ value }` on success (null when the field was left blank) or `{ error }`
 * when something was typed but it can't plausibly be a phone number.
 */
function parseOwnerPhone(
  raw: FormDataEntryValue | null,
): { value: string | null } | { error: string } {
  const text = textOrNull(raw);
  if (!text) return { value: null };
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7) {
    return { error: "That phone number looks too short — check it and try again." };
  }
  const normalized = (text.trimStart().startsWith("+") ? "+" : "") + digits;
  return { value: normalized };
}

/** Validates an http(s) URL. `{ value: null }` when blank; `{ error }` when invalid. */
function parseReviewLink(
  raw: FormDataEntryValue | null,
): { value: string | null } | { error: string } {
  const text = textOrNull(raw);
  if (!text) return { value: null };
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "Review link must start with http:// or https://." };
    }
    return { value: url.toString() };
  } catch {
    return { error: "Review link must be a full URL like https://g.page/r/…" };
  }
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

  const ownerPhone = parseOwnerPhone(formData.get("owner_phone"));
  if ("error" in ownerPhone) return { ok: false, error: ownerPhone.error };

  const reviewLink = parseReviewLink(formData.get("review_link"));
  if ("error" in reviewLink) return { ok: false, error: reviewLink.error };

  const routingRaw = formData.get("call_routing_mode");
  const callRoutingMode: CallRoutingMode =
    typeof routingRaw === "string" &&
    CALL_ROUTING_MODES.includes(routingRaw as CallRoutingMode)
      ? (routingRaw as CallRoutingMode)
      : context.business.call_routing_mode;

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
      owner_phone: ownerPhone.value,
      review_link: reviewLink.value,
      call_routing_mode: callRoutingMode,
    })
    .eq("id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Saves notification channel + digest preferences (design §12). Instant alerts
 * for bookings/emergencies are fixed policy and not stored here.
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
  const prefs: NotificationPreferences = {
    channels,
    daily_digest: formData.get("daily_digest") != null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ notification_preferences: prefs })
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

// --- Widget customization (v2) ----------------------------------------------

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const GREETING_MAX_LENGTH = 200;
const WIDGET_POSITIONS = ["right", "left"] as const;

/**
 * Saves the owner's widget appearance overrides (v2 / 0011). Validates every
 * field and writes ONLY the known keys — anything else a tampered form sends is
 * dropped, so `widget_config` can never carry unexpected data to the public
 * widget frame. Shaped for `useActionState`.
 */
export async function saveWidgetConfig(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const config: WidgetConfig = {};

  const accent = textOrNull(formData.get("accent_color"));
  if (accent) {
    if (!HEX_COLOR_RE.test(accent)) {
      return {
        ok: false,
        error: "Accent color must be a 6-digit hex value like #0e4c5e.",
      };
    }
    config.accent_color = accent.toLowerCase();
  }

  const greeting = textOrNull(formData.get("greeting"));
  if (greeting) {
    if (greeting.length > GREETING_MAX_LENGTH) {
      return {
        ok: false,
        error: `Greeting must be ${GREETING_MAX_LENGTH} characters or fewer.`,
      };
    }
    config.greeting = greeting;
  }

  const position = formData.get("position");
  if (typeof position === "string" && position.length > 0) {
    if (!WIDGET_POSITIONS.includes(position as "right" | "left")) {
      return { ok: false, error: "Widget position must be left or right." };
    }
    config.position = position as "right" | "left";
  }

  // Teaser is strictly opt-in: only an explicit "true" persists the flag;
  // anything else (missing, tampered values) is stripped, leaving the default off.
  if (formData.get("teaser") === "true") {
    config.teaser = true;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ widget_config: config })
    .eq("id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

// --- Team management (v2) ----------------------------------------------------

/** Invite feedback: `message` carries the "what happens next" success copy. */
export type InviteResult = { ok: boolean; error?: string; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Records a staff invite (v2). Owner-only. `business_users` intentionally has
 * no tenant INSERT policy, so after the owner check the row is written via the
 * admin client, explicitly scoped to the owner's own business. The invitee
 * isn't emailed anything by us — the existing /accept-invite flow plus the
 * 0003 auth trigger link their account the moment they sign up with this
 * email. Shaped for `useActionState`.
 */
export async function inviteStaff(
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };
  if (context.membership.role !== "owner") {
    return { ok: false, error: "Only the owner can invite teammates." };
  }

  const raw = textOrNull(formData.get("email"));
  const email = raw?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("business_users").insert({
    business_id: context.business.id,
    email,
    role: "staff",
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That email is already on the team." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/settings");
  return {
    ok: true,
    message:
      `Invite recorded — tell them to create their password at ` +
      `${publicEnv.appUrl}/accept-invite using this email.`,
  };
}

/**
 * Removes a staff member (v2). Owner-only; refuses to touch owner rows, so the
 * business can never orphan itself. Reads and deletes via the admin client but
 * always scoped to the caller's own business_id — the same trust model as
 * inviteStaff. Called directly from a client onClick, so it takes explicit args.
 */
export async function removeStaff(memberId: string): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };
  if (context.membership.role !== "owner") {
    return { ok: false, error: "Only the owner can remove teammates." };
  }

  const admin = createAdminClient();
  const { data: member, error: fetchError } = await admin
    .from("business_users")
    .select("id, role")
    .eq("id", memberId)
    .eq("business_id", context.business.id)
    .maybeSingle<{ id: string; role: "owner" | "staff" }>();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!member) return { ok: false, error: "That team member no longer exists." };
  if (member.role === "owner") {
    return { ok: false, error: "The owner can't be removed from the team." };
  }

  const { error } = await admin
    .from("business_users")
    .delete()
    .eq("id", member.id)
    .eq("business_id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}
