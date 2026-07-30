import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOperator } from "@/lib/auth/operator";
import { Card } from "@/components/shared/Card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/dashboard/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessStatus } from "@/lib/types/database";

export const metadata: Metadata = { title: "Operator — Clients" };

// This view reads across all tenants, so it must never be statically cached.
export const dynamic = "force-dynamic";

interface ClientRow {
  id: string;
  name: string;
  owner_email: string;
  status: BusinessStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  grace_period_ends_at: string | null;
  created_at: string;
}

const STATUS_ORDER: BusinessStatus[] = [
  "past_due",
  "paused",
  "trial",
  "active",
  "canceled",
];

/**
 * Looks up each subscription's next renewal date from Stripe, in parallel.
 * Returns an empty map if Stripe is unavailable (keys unset) so the page still
 * renders — billing status comes from our own DB, renewal date is a nice-to-have.
 */
async function loadRenewals(
  subscriptionIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (subscriptionIds.length === 0) return map;
  let stripe;
  try {
    const { getStripe } = await import("@/lib/stripe/client");
    stripe = getStripe();
  } catch {
    return map; // no keys configured — skip renewal enrichment
  }
  await Promise.all(
    subscriptionIds.map(async (id) => {
      try {
        const sub = await stripe.subscriptions.retrieve(id);
        const periodEnd = sub.items.data[0]?.current_period_end ?? null;
        if (periodEnd) {
          map.set(id, new Date(periodEnd * 1000).toISOString());
        }
      } catch {
        // Ignore a single failed lookup; the row just shows "—".
      }
    }),
  );
  return map;
}

export default async function AdminClientsPage() {
  // Gate the data fetch itself (not just the layout): the page renders
  // concurrently with the layout, so without this check the cross-tenant query
  // below would still run and its results would be serialized into the response
  // body even though the layout issues a redirect.
  const operator = await getOperator();
  if (!operator) redirect("/dashboard");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("businesses")
    .select(
      "id, name, owner_email, status, stripe_customer_id, stripe_subscription_id, grace_period_ends_at, created_at",
    )
    .order("created_at", { ascending: false })
    .returns<ClientRow[]>();

  const clients = data ?? [];
  const renewals = await loadRenewals(
    clients.map((c) => c.stripe_subscription_id).filter((s): s is string => !!s),
  );

  const counts = clients.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        Clients
      </h1>
      <p className="mt-1 text-sm text-muted">
        Every business and its billing status at a glance.
      </p>

      {/* Summary counts by status */}
      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <StatusBadge status={s} />
            <span className="text-sm font-medium text-ink-700">
              {counts[s]}
            </span>
          </span>
        ))}
        <span className="ml-auto text-sm text-muted">
          {clients.length} total
        </span>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Next renewal</th>
              <th className="px-4 py-3">Grace ends</th>
              <th className="px-4 py-3">Onboarded</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3 font-medium text-ink-900">
                  {c.name}
                </td>
                <td className="px-4 py-3 text-muted">
                  {c.owner_email}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {c.stripe_subscription_id
                    ? (renewals.get(c.stripe_subscription_id) &&
                        formatDate(renewals.get(c.stripe_subscription_id)!)) ||
                      "—"
                    : "No subscription"}
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {c.status === "past_due" && c.grace_period_ends_at
                    ? formatDate(c.grace_period_ends_at)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-muted">
                  {formatDate(c.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {clients.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No clients yet.</p>
      ) : null}
    </div>
  );
}
