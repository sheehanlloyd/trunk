import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { notifyOwner } from "@/lib/notifications/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business } from "@/lib/types/database";

export const runtime = "nodejs";

/**
 * POST /api/stripe/expire-grace (design §10, step 4→5). The daily grace sweep:
 * any business still `past_due` whose grace window has elapsed moves to `paused`.
 * Guarded by a shared secret (Bearer CRON_SECRET) so only the scheduler can call
 * it. Idempotent — it only acts on still-past_due rows with an expired deadline,
 * and updates with a `status="past_due"` guard, so re-running pauses nothing new.
 * Never deletes data (design §10: "never destroy client data on a billing lapse").
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  // Rows with a null grace deadline are excluded (`.lt` skips nulls) — correct.
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, owner_email, notification_preferences")
    .eq("status", "past_due")
    .lt("grace_period_ends_at", nowIso)
    .returns<
      Pick<Business, "id" | "name" | "owner_email" | "notification_preferences">[]
    >();

  if (error) {
    console.error("[stripe/expire-grace] query failed", error);
    return NextResponse.json({ error: "Query failed." }, { status: 500 });
  }

  const expired = data ?? [];
  let paused = 0;

  for (const business of expired) {
    const { error: updateError } = await supabase
      .from("businesses")
      .update({ status: "paused" })
      .eq("id", business.id)
      .eq("status", "past_due"); // guard: skip if it recovered meanwhile
    if (updateError) {
      console.error("[stripe/expire-grace] pause failed", business.id, updateError);
      continue;
    }
    paused += 1;
    await notifyOwner({
      business,
      reason: "billing_paused",
      subject: "Your AI receptionist is paused",
      body:
        `${business.name}'s AI receptionist is paused because of a billing issue. ` +
        `Update your payment method to switch it back on — all your conversations, ` +
        `bookings, and settings are safe and waiting.`,
    });
  }

  return NextResponse.json({ paused, checked: expired.length });
}
