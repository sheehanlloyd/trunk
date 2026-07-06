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

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      name,
      owner_email: ownerEmail,
      service_area: String(draft.service_area ?? "").trim() || null,
      services: sanitizeServices(draft.services),
      hours: sanitizeHours(draft.hours),
      emergency_policy: String(draft.emergency_policy ?? "").trim() || null,
      raw_scraped_content: body.rawScrapedContent ?? null,
      status: "trial",
    })
    .select("id")
    .single<{ id: string }>();

  if (businessError || !business) {
    console.error("[create-business] insert business failed", businessError);
    return NextResponse.json(
      { error: "Could not create the business record." },
      { status: 500 },
    );
  }

  const { error: userError } = await supabase.from("business_users").insert({
    business_id: business.id,
    email: ownerEmail,
    role: "owner",
    auth_user_id: null,
  });

  if (userError) {
    // Roll back the orphaned business so a retry starts clean.
    await supabase.from("businesses").delete().eq("id", business.id);
    console.error("[create-business] insert owner failed", userError);
    return NextResponse.json(
      { error: "Could not create the owner account. Please try again." },
      { status: 500 },
    );
  }

  // Provision a real Twilio voice number and store it (design §7 step 4).
  // Best-effort: if Twilio is unconfigured or the purchase fails, the business
  // still goes live and this can be retried — onboarding never hard-fails on it.
  const phoneNumber = await provisionNumber(business.id);
  if (phoneNumber) {
    await supabase
      .from("businesses")
      .update({ phone_number: phoneNumber })
      .eq("id", business.id);
  }

  return NextResponse.json({
    businessId: business.id,
    embedCode: buildEmbedCode(business.id),
    phoneNumber, // string (E.164) when provisioned, else null
    phoneNumberPlaceholder: PHONE_NUMBER_PLACEHOLDER,
  });
}
