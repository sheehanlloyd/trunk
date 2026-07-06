import { NextResponse } from "next/server";

import { getOperator } from "@/lib/auth/operator";
import { buildEmbedCode, PHONE_NUMBER_PLACEHOLDER } from "@/lib/onboarding/embed";
import type { OnboardingDraft } from "@/lib/onboarding/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionNumber } from "@/lib/twilio/client";
import type { ServiceItem } from "@/lib/types/database";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreateBody {
  draft?: Partial<OnboardingDraft>;
  ownerEmail?: string;
  rawScrapedContent?: string;
}

/** Coerces arbitrary input into a clean ServiceItem[], dropping empties. */
function sanitizeServices(input: unknown): ServiceItem[] {
  if (!Array.isArray(input)) return [];
  const out: ServiceItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const service = String((raw as ServiceItem).service ?? "").trim();
    if (!service) continue;
    const item: ServiceItem = { service };
    const description = String((raw as ServiceItem).description ?? "").trim();
    const priceRange = String((raw as ServiceItem).price_range ?? "").trim();
    if (description) item.description = description;
    if (priceRange) item.price_range = priceRange;
    out.push(item);
  }
  return out;
}

/** Coerces arbitrary input into a clean weekday->hours map, dropping empties. */
function sanitizeHours(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const day = key.trim().toLowerCase();
    const val = String(value ?? "").trim();
    if (day && val) out[day] = val;
  }
  return out;
}

/**
 * POST /api/onboarding/create-business
 * Body: { draft, ownerEmail, rawScrapedContent }
 *
 * Operator-only. Persists the reviewed draft as a new tenant: a `businesses`
 * row (status=trial) plus its first owner `business_users` row (auth_user_id
 * null — linked when the owner accepts their invite via the 0003 trigger).
 * Runs with the service role because there is no INSERT RLS policy on these
 * tables. Returns the client's onboarding outputs.
 */
export async function POST(request: Request) {
  const operator = await getOperator();
  if (!operator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const draft = body.draft ?? {};
  const name = String(draft.name ?? "").trim();
  const ownerEmail = String(body.ownerEmail ?? "").trim().toLowerCase();

  if (!name) {
    return NextResponse.json(
      { error: "Business name is required." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(ownerEmail)) {
    return NextResponse.json(
      { error: "A valid owner email is required." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Business + owner-user creation happens in one DB transaction (migration
  // 0010) so a crash between the two inserts can't leave an orphaned,
  // ownerless business — the prior two-step insert + manual rollback only
  // covered an insert *error*, not a process crash mid-request.
  const { data, error: createError } = await supabase.rpc("create_business_with_owner", {
    p_name: name,
    p_owner_email: ownerEmail,
    p_service_area: String(draft.service_area ?? "").trim() || null,
    p_services: sanitizeServices(draft.services),
    p_hours: sanitizeHours(draft.hours),
    p_emergency_policy: String(draft.emergency_policy ?? "").trim() || null,
    p_raw_scraped_content: body.rawScrapedContent ?? null,
  });
  const businessId = data as string | null;

  if (createError || !businessId) {
    console.error("[create-business] create_business_with_owner failed", createError?.message);
    return NextResponse.json(
      { error: "Could not create the business. Please try again." },
      { status: 500 },
    );
  }

  // Provision a real Twilio voice number and store it (design §7 step 4).
  // Best-effort: if Twilio is unconfigured or the purchase fails, the business
  // still goes live and this can be retried — onboarding never hard-fails on it.
  const phoneNumber = await provisionNumber(businessId);
  if (phoneNumber) {
    await supabase
      .from("businesses")
      .update({ phone_number: phoneNumber })
      .eq("id", businessId);
  }

  return NextResponse.json({
    businessId,
    embedCode: buildEmbedCode(businessId),
    phoneNumber, // string (E.164) when provisioned, else null
    phoneNumberPlaceholder: PHONE_NUMBER_PLACEHOLDER,
  });
}
