import type Stripe from "stripe";

import { billingGracePeriodDays } from "@/lib/env";
import { notifyOwner } from "@/lib/notifications/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business } from "@/lib/types/database";

/**
 * Core Stripe webhook handling (design §10). Kept separate from the route so the
 * signature/idempotency plumbing stays thin and this logic is unit-testable.
 *
 * Every branch is a pure status transition guarded by current state, so running
 * the same event twice is a no-op — the route's event ledger is the first line
 * of idempotency, and these state guards are the backstop. Billing NEVER deletes
 * business data; it only updates `status` (and the stripe id / grace columns).
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface EventResult {
  businessId: string | null;
  action: string;
}

/** Normalizes Stripe's `string | {id}` expandable refs to a plain id. */
function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/** Resolves the tenant for an event by (in order) metadata, subscription, customer. */
async function findBusiness(
  supabase: Admin,
  keys: {
    businessId?: string | null;
    subscriptionId?: string | null;
    customerId?: string | null;
  },
): Promise<Business | null> {
  const lookup = async (column: string, value: string) => {
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .eq(column, value)
      .maybeSingle<Business>();
    return data ?? null;
  };

  if (keys.businessId) {
    const b = await lookup("id", keys.businessId);
    if (b) return b;
  }
  if (keys.subscriptionId) {
    const b = await lookup("stripe_subscription_id", keys.subscriptionId);
    if (b) return b;
  }
  if (keys.customerId) {
    const b = await lookup("stripe_customer_id", keys.customerId);
    if (b) return b;
  }
  return null;
}

export async function processStripeEvent(
  event: Stripe.Event,
): Promise<EventResult> {
  const supabase = createAdminClient();

  switch (event.type) {
    // Point of sale: first payment for the $500 setup + $199/mo succeeded.
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = idOf(session.customer);
      const subscriptionId = idOf(session.subscription);
      const business = await findBusiness(supabase, {
        businessId: session.metadata?.business_id,
        subscriptionId,
        customerId,
      });
      if (!business) return { businessId: null, action: "checkout_unresolved" };

      await supabase
        .from("businesses")
        .update({
          status: "active",
          stripe_customer_id: customerId ?? business.stripe_customer_id,
          stripe_subscription_id:
            subscriptionId ?? business.stripe_subscription_id,
          grace_period_ends_at: null,
        })
        .eq("id", business.id);
      return { businessId: business.id, action: "activated" };
    }

    // Monthly renewal succeeded (also fires for the first invoice). Recovers a
    // business from past_due/paused back to active.
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const details = invoice.parent?.subscription_details ?? null;
      const subscriptionId = idOf(details?.subscription ?? null);
      const business = await findBusiness(supabase, {
        businessId: details?.metadata?.business_id,
        subscriptionId,
        customerId: idOf(invoice.customer ?? null),
      });
      if (!business) return { businessId: null, action: "renew_unresolved" };

      await supabase
        .from("businesses")
        .update({
          status: "active",
          stripe_subscription_id:
            subscriptionId ?? business.stripe_subscription_id,
          grace_period_ends_at: null,
        })
        .eq("id", business.id);
      return { businessId: business.id, action: "renewed" };
    }

    // Renewal failed. Enter the grace window and alert the owner — but only on
    // the transition, so repeat deliveries don't re-notify (design §10).
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const details = invoice.parent?.subscription_details ?? null;
      const business = await findBusiness(supabase, {
        businessId: details?.metadata?.business_id,
        subscriptionId: idOf(details?.subscription ?? null),
        customerId: idOf(invoice.customer ?? null),
      });
      if (!business) return { businessId: null, action: "failed_unresolved" };

      // Already in (or past) a failure state — nothing to do.
      if (business.status !== "active" && business.status !== "trial") {
        return { businessId: business.id, action: "already_failing" };
      }

      const graceDays = billingGracePeriodDays();
      const graceEndsAt = new Date(
        Date.now() + graceDays * 86_400_000,
      ).toISOString();

      await supabase
        .from("businesses")
        .update({ status: "past_due", grace_period_ends_at: graceEndsAt })
        .eq("id", business.id);

      await notifyOwner({
        business,
        reason: "billing_past_due",
        subject: "Payment problem — your AI receptionist",
        body:
          `We couldn't process your payment for ${business.name}. Please update ` +
          `your card to keep your AI receptionist answering. You have ${graceDays} ` +
          `days before it pauses — your data stays safe either way.`,
      });
      return { businessId: business.id, action: "past_due" };
    }

    // Subscription ended.
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const business = await findBusiness(supabase, {
        businessId: subscription.metadata?.business_id,
        subscriptionId: subscription.id,
        customerId: idOf(subscription.customer),
      });
      if (!business) return { businessId: null, action: "cancel_unresolved" };

      await supabase
        .from("businesses")
        .update({ status: "canceled", grace_period_ends_at: null })
        .eq("id", business.id);
      return { businessId: business.id, action: "canceled" };
    }

    // customer.subscription.updated is intentionally not handled: the four
    // events above cover every §10 transition without overlapping logic.
    default:
      return { businessId: null, action: "ignored" };
  }
}
