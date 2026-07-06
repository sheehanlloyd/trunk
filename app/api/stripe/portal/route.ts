import { NextResponse } from "next/server";

import { getCurrentBusiness } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

/**
 * POST /api/stripe/portal (design §10, step 4). Opens Stripe's hosted customer
 * portal so the owner can update their card, view invoices, or cancel — no
 * payment data ever touches our servers. Owner-initiated from the billing page.
 */
export async function POST() {
  const context = await getCurrentBusiness();
  if (!context) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { business } = context;

  if (!business.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account yet. Start your subscription first." },
      { status: 400 },
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: `${publicEnv.appUrl}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal] failed", err);
    return NextResponse.json(
      { error: "Could not open the billing portal. Please try again." },
      { status: 500 },
    );
  }
}
