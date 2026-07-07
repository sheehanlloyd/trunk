import { NextResponse } from "next/server";

import { isServiceLive } from "@/lib/billing/status";
import { serverEnv } from "@/lib/env";
import {
  buildDigest,
  type DigestConversation,
  type DigestLead,
} from "@/lib/notifications/digest";
import { notifyOwner } from "@/lib/notifications/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business } from "@/lib/types/database";

export const runtime = "nodejs";

/** How far back the digest looks. Meant to be run once daily. */
const WINDOW_HOURS = 24;

type DigestBusiness = Pick<
  Business,
  | "id"
  | "name"
  | "owner_email"
  | "owner_phone"
  | "notification_preferences"
  | "status"
  | "grace_period_ends_at"
>;

/**
 * POST /api/notifications/digest — the daily activity digest (design §12,
 * "Owner notification fatigue"). Reserves instant alerts for bookings and
 * emergencies (fired live in the engine) and batches everything else into one
 * daily summary per business.
 *
 * Guarded by the shared CRON_SECRET, same as the grace-expiry sweep, so only the
 * scheduler can trigger it. Idempotent-ish: safe to re-run, but intended once a
 * day — a second run in the same window would re-summarize the same activity, so
 * schedule it once. Only businesses that opted into the digest AND are currently
 * serving (not paused) are included; a paused business gets no digest.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Only businesses that opted into the digest. Paused ones are filtered below.
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, owner_email, owner_phone, notification_preferences, status, grace_period_ends_at",
    )
    .eq("notification_preferences->>daily_digest", "true")
    .returns<DigestBusiness[]>();

  if (error) {
    console.error("[notifications/digest] query failed", error);
    return NextResponse.json({ error: "Query failed." }, { status: 500 });
  }

  const businesses = data ?? [];
  let sent = 0;
  let skipped = 0;

  for (const business of businesses) {
    // A paused (or grace-elapsed) business isn't serving customers, so don't
    // dispatch it a digest — mirrors the widget/chat/voice billing gate.
    if (!isServiceLive(business.status, business.grace_period_ends_at)) {
      skipped += 1;
      continue;
    }

    const [
      { data: conversations, error: conversationsError },
      { data: leads, error: leadsError },
    ] = await Promise.all([
      supabase
        .from("conversations")
        .select("outcome")
        .eq("business_id", business.id)
        .gte("created_at", since)
        .returns<DigestConversation[]>(),
      supabase
        .from("leads")
        .select("reason")
        .eq("business_id", business.id)
        .gte("created_at", since)
        .returns<DigestLead[]>(),
    ]);

    if (conversationsError || leadsError) {
      // Don't silently send an incomplete ("0 activity") digest built from a
      // partial query failure — skip this business and let the next run retry.
      console.error(
        "[notifications/digest] activity query failed",
        business.id,
        (conversationsError ?? leadsError)?.message,
      );
      skipped += 1;
      continue;
    }

    const digest = buildDigest({
      businessName: business.name,
      conversations: conversations ?? [],
      leads: leads ?? [],
    });

    // Skip the send when nothing happened — no "you had 0 conversations" noise.
    if (!digest.hasActivity) {
      skipped += 1;
      continue;
    }

    await notifyOwner({
      business,
      reason: "digest",
      subject: digest.subject,
      body: digest.body,
    });
    sent += 1;
  }

  return NextResponse.json({ sent, skipped, checked: businesses.length });
}
