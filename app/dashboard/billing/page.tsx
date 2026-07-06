import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BillingActionButton } from "@/components/dashboard/BillingActionButton";
import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import { formatDate } from "@/lib/dashboard/format";

export const metadata: Metadata = { title: "Billing — AI Receptionist" };

interface SubscriptionInfo {
  nextRenewal: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Fetches live renewal info from Stripe; returns null if unavailable (keys unset,
 *  API error) so the page still renders with the stored status. */
async function loadSubscription(
  subscriptionId: string | null,
): Promise<SubscriptionInfo | null> {
  if (!subscriptionId) return null;
  try {
    const { getStripe } = await import("@/lib/stripe/client");
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    // In the current API version the period boundary lives on the item.
    const periodEnd = sub.items.data[0]?.current_period_end ?? null;
    return {
      nextRenewal: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  } catch (err) {
    console.error("[billing] subscription fetch failed", err);
    return null;
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const context = await requireAuth();
  if (!context) return null;
  const { business } = context;
  const { checkout } = await searchParams;

  const subscription = await loadSubscription(business.stripe_subscription_id);
  const hasCustomer = Boolean(business.stripe_customer_id);
  const showStart =
    business.status === "trial" || business.status === "canceled";

  return (
    <PageLayout
      title="Billing"
      description="Your subscription and payment method."
    >
      {checkout === "success" ? (
        <Banner tone="success">
          Payment received — your subscription is active. Thank you!
        </Banner>
      ) : null}
      {checkout === "canceled" ? (
        <Banner tone="neutral">
          Checkout canceled — no charge was made. You can start again anytime.
        </Banner>
      ) : null}

      {business.status === "past_due" ? (
        <Banner tone="warning">
          <strong className="font-semibold">Your last payment failed.</strong>{" "}
          Update your card to keep your AI receptionist on.
          {business.grace_period_ends_at
            ? ` Service pauses on ${formatDate(business.grace_period_ends_at)} if it isn't resolved.`
            : ""}
        </Banner>
      ) : null}
      {business.status === "paused" ? (
        <Banner tone="danger">
          <strong className="font-semibold">Your receptionist is paused.</strong>{" "}
          Update your payment method to switch it back on — all your data is safe.
        </Banner>
      ) : null}

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Subscription status
            </p>
            <p className="mt-1 text-sm text-muted">
              $500 one-time setup + $199/month
            </p>
          </div>
          <StatusBadge status={business.status} />
        </div>

        {subscription ? (
          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                {subscription.cancelAtPeriodEnd ? "Access ends" : "Next renewal"}
              </dt>
              <dd className="mt-1 text-sm text-slate-900">
                {subscription.nextRenewal
                  ? formatDate(subscription.nextRenewal)
                  : "—"}
              </dd>
            </div>
            {subscription.cancelAtPeriodEnd ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  Auto-renew
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  Off — cancels at period end
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
          {showStart ? (
            <BillingActionButton
              endpoint="/api/stripe/checkout"
              label="Start subscription"
              variant="primary"
            />
          ) : null}
          {hasCustomer ? (
            <BillingActionButton
              endpoint="/api/stripe/portal"
              label="Manage billing & payment method"
              variant={showStart ? "secondary" : "primary"}
            />
          ) : null}
        </div>
      </Card>
    </PageLayout>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
}) {
  const styles: Record<string, string> = {
    success: "border-accent-200 bg-accent-50 text-accent-700",
    warning: "border-amber-300 bg-amber-50 text-amber-800",
    danger: "border-red-300 bg-red-50 text-red-700",
    neutral: "border-border bg-slate-50 text-slate-700",
  };
  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}>
      {children}
    </div>
  );
}
