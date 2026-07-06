import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { processStripeEvent } from "@/lib/billing/webhook";
import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Stripe webhook (design §10). Verifies the signature against the raw body,
 * then processes the event exactly once.
 *
 * Idempotency (task constraint): we claim the event id in `stripe_webhook_events`
 * before doing any work. A duplicate delivery of an already-processed event is
 * acknowledged and skipped. A row whose `processed_at` is still null means a
 * previous attempt died mid-flight, so we let the retry reprocess it. We never
 * delete anything — business data and the ledger are only ever inserted/updated.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // Raw body is required for HMAC signature verification.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      serverEnv.stripe.webhookSecret,
    );
  } catch (err) {
    // Never log the raw error object here: a signature-verification failure
    // (Stripe.errors.StripeSignatureVerificationError) carries the full unverified
    // request payload/header on its own properties, which can include customer
    // email/billing details. Log only the message.
    console.error(
      "[stripe/webhook] signature verification failed",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Claim the event. Unique PK on stripe_event_id makes this the idempotency gate.
  const { error: claimError } = await supabase
    .from("stripe_webhook_events")
    .insert({ stripe_event_id: event.id, type: event.type });

  if (claimError) {
    if (claimError.code === "23505") {
      // Already seen. Only skip if it actually finished; else fall through and retry.
      const { data: existing } = await supabase
        .from("stripe_webhook_events")
        .select("processed_at")
        .eq("stripe_event_id", event.id)
        .maybeSingle<{ processed_at: string | null }>();
      if (existing?.processed_at) {
        return NextResponse.json({ received: true, duplicate: true });
      }
    } else {
      console.error(
        "[stripe/webhook] ledger insert failed",
        event.id,
        claimError.message,
      );
      return NextResponse.json({ error: "Ledger error." }, { status: 500 });
    }
  }

  try {
    const result = await processStripeEvent(event);
    await supabase
      .from("stripe_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        business_id: result.businessId,
      })
      .eq("stripe_event_id", event.id);
    return NextResponse.json({ received: true, action: result.action });
  } catch (err) {
    // Leave processed_at null so Stripe's automatic retry reprocesses cleanly.
    // Log only the message + safe identifiers, never the raw error object.
    console.error(
      "[stripe/webhook] processing failed",
      event.type,
      event.id,
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
