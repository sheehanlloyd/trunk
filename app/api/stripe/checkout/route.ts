import { NextResponse } from "next/server";

import { getCurrentBusiness } from "@/lib/auth/session";
import { publicEnv, serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/stripe/checkout (design §10, step 2). Owner-initiated from the
 * billing page. Creates a Checkout Session that charges the one-time $500 setup
 * fee and starts the $199/mo subscription together: subscription mode with two
 * line items — the recurring price plus the one-time setup price, which lands on
 * the first invoice. Webhooks then flip the business to `active`.
 */
export async function POST() {
  const context = await getCurrentBusiness();
  if (!context) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { business } = context;

  if (business.status === "active" || business.status === "past_due") {
    return NextResponse.json(
      { error: "You already have a subscription. Use “Manage billing” instead." },
      { status: 400 },
    );
  }

  try {
    const stripe = getStripe();

    // Reuse the tenant's Stripe customer, or create + persist one now so the
    // customer portal and webhooks can always tie back to this business.
    let customerId = business.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: business.owner_email,
        name: business.name,
        metadata: { business_id: business.id },
      });
      customerId = customer.id;
      await createAdminClient()
        .from("businesses")
        .update({ stripe_customer_id: customerId })
        .eq("id", business.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        { price: serverEnv.stripe.priceSubscription, quantity: 1 },
        { price: serverEnv.stripe.priceSetupFee, quantity: 1 },
      ],
      metadata: { business_id: business.id },
      subscription_data: { metadata: { business_id: business.id } },
      success_url: `${publicEnv.appUrl}/dashboard/billing?checkout=success`,
      cancel_url: `${publicEnv.appUrl}/dashboard/billing?checkout=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout] failed", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 },
    );
  }
}
