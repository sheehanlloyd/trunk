import type { Metadata } from "next";
import Link from "next/link";

import { LeadCard } from "@/components/dashboard/LeadCard";
import { Card, StatCard } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { requireAuth } from "@/lib/auth/session";
import { formatCents } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types/database";

export const metadata: Metadata = { title: "Leads" };

/** The three tabs; "open" is the working queue and the default. */
const TABS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const EMPTY_COPY: Record<Tab, string> = {
  open: "No open leads — the AI hasn't dropped any balls lately.",
  resolved:
    "Nothing resolved yet. When you mark a lead handled, it lands here.",
  all: "No leads yet. When a caller drops off mid-booking, their details are saved here so you can win the job back.",
};

/** ISO string for the start of the current UTC month — scopes "this month". */
function startOfMonthISO(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

/** Page size for "Load more" — also the increment each click adds. */
const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; limit?: string }>;
}) {
  const context = await requireAuth();
  if (!context) return null;

  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.value === params.status)
    ? (params.status as Tab)
    : "open";
  const requestedLimit = Number.parseInt(params.limit ?? "", 10);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 5000)
      : PAGE_SIZE;

  const supabase = await createClient();

  let listQuery = supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    // Fetch one extra row to detect whether there's more beyond this page.
    .range(0, limit);
  if (tab === "open") listQuery = listQuery.is("resolved_at", null);
  if (tab === "resolved") listQuery = listQuery.not("resolved_at", "is", null);

  // Stat strip counts are independent of the active tab, so head-only count
  // queries keep them cheap regardless of how many leads exist.
  const [{ data }, { count: openCount }, { count: resolvedThisMonth }] =
    await Promise.all([
      listQuery.returns<Lead[]>(),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("resolved_at", null),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("resolved_at", startOfMonthISO()),
    ]);

  const hasMore = (data?.length ?? 0) > limit;
  const leads = (data ?? []).slice(0, limit);

  const avgJobValue = context.business.average_job_value_cents;
  const open = openCount ?? 0;

  const loadMoreParams = new URLSearchParams();
  if (tab !== "open") loadMoreParams.set("status", tab);
  loadMoreParams.set("limit", String(limit + PAGE_SIZE));

  return (
    <PageLayout
      title="Leads"
      description="Customers who almost booked. Call them back before a competitor does."
    >
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Open leads" value={open} />
        <StatCard label="Resolved this month" value={resolvedThisMonth ?? 0} />
        {avgJobValue != null ? (
          <StatCard
            label="Recoverable revenue"
            value={formatCents(open * avgJobValue)}
            hint="Open leads × your average job value"
            tone="accent"
          />
        ) : null}
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-border bg-white p-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={
              t.value === "open"
                ? "/dashboard/leads"
                : `/dashboard/leads?status=${t.value}`
            }
            className={
              "rounded-md px-4 py-2 text-sm font-medium transition-colors " +
              (tab === t.value
                ? "bg-brand-600 text-white"
                : "text-ink-700 hover:bg-ink-50")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">{EMPTY_COPY[tab]}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Link
            href={`/dashboard/leads?${loadMoreParams.toString()}`}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </PageLayout>
  );
}
