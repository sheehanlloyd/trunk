import type { Metadata } from "next";
import Link from "next/link";

import { RevenueHero } from "@/components/dashboard/RevenueHero";
import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import {
  dailySeries,
  daysAgoISO,
  deltaPct,
  formatDateTime,
  startOfTodayISO,
} from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/database";

export const metadata: Metadata = { title: "Dashboard — AI Receptionist" };

/** Flagged = AI wasn't sure, or the request was unclear. These need a human look. */
const ATTENTION_FILTER = "ai_confidence_flag.eq.true,outcome.eq.unclear";

/** Trend window for the revenue hero. */
const TREND_DAYS = 14;

type FlaggedRow = Pick<
  Conversation,
  | "id"
  | "customer_name"
  | "customer_phone"
  | "outcome"
  | "ai_confidence_flag"
  | "channel"
  | "created_at"
>;

export default async function DashboardOverviewPage() {
  const context = await requireAuth();
  // Layout already handles the null case; guard for type-narrowing.
  if (!context) return null;

  const { business } = context;
  const supabase = await createClient();
  const todayStart = startOfTodayISO();
  const trendStart = daysAgoISO(TREND_DAYS);

  // All queries below are automatically scoped to this tenant by RLS.
  const [
    conversationsToday,
    bookingsToday,
    needsAttention,
    trendBookings,
    attentionList,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .or(ATTENTION_FILTER),
    // Bookings over the trend window (excluding canceled) → daily series for the
    // revenue sparkline. created_at × avg job value = captured revenue.
    supabase
      .from("bookings")
      .select("created_at")
      .gte("created_at", trendStart)
      .neq("status", "canceled")
      .returns<{ created_at: string }[]>(),
    supabase
      .from("conversations")
      .select("id, customer_name, customer_phone, outcome, ai_confidence_flag, channel, created_at")
      .or(ATTENTION_FILTER)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<FlaggedRow[]>(),
  ]);

  const attentionCount = needsAttention.count ?? 0;
  const flagged = attentionList.data ?? [];

  const avgDollars =
    business.average_job_value_cents != null
      ? business.average_job_value_cents / 100
      : null;

  // Per-day counts → per-day revenue (or raw counts when avg value is unset).
  const countSeries = dailySeries(
    (trendBookings.data ?? []).map((b) => b.created_at),
    TREND_DAYS,
  );
  const weekJobs = countSeries.slice(-7).reduce((a, b) => a + b, 0);
  const revenueSeries = countSeries.map((c) => c * (avgDollars ?? 1));
  const weekRevenue = countSeries
    .slice(-7)
    .reduce((sum, c) => sum + c * (avgDollars ?? 0), 0);

  return (
    <PageLayout
      title="Dashboard"
      description="Your AI receptionist activity at a glance."
      actions={<StatusBadge status={business.status} />}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <RevenueHero
          amount={Math.round(weekRevenue)}
          series={revenueSeries}
          jobs={weekJobs}
          deltaPct={deltaPct(countSeries)}
          needsAvgValue={avgDollars == null}
        />

        {/* Compact secondary instruments — today's activity, deliberately smaller
            than the money story above/beside them. */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <MiniStat label="Conversations today" value={conversationsToday.count ?? 0} />
          <MiniStat label="Bookings today" value={bookingsToday.count ?? 0} />
        </div>
      </div>

      {/* Needs-attention as its own action strip, not a vanity metric. */}
      {attentionCount > 0 ? (
        <Link
          href="/dashboard/conversations?outcome=attention"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-copper-200 bg-copper-50 px-5 py-4 shadow-card transition-colors hover:bg-copper-100"
        >
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-bold text-copper-700">
              {attentionCount}
            </span>
            <span className="text-sm font-medium text-copper-700">
              {attentionCount === 1 ? "conversation needs" : "conversations need"} a
              closer look
            </span>
          </div>
          <span aria-hidden className="text-copper-600">→</span>
        </Link>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-surface px-5 py-4 text-sm text-muted shadow-card">
          Nothing needs review right now — your AI has it handled.
        </div>
      )}

      {flagged.length > 0 ? (
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-base font-semibold text-brand-800">
              Needs a closer look
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Conversations the AI wasn&apos;t sure about — tap to read.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {flagged.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-ink-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {c.customer_name ?? c.customer_phone ?? "Unknown caller"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.channel === "voice" ? "Call" : "Chat"} ·{" "}
                      {formatDateTime(c.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.ai_confidence_flag ? (
                      <span className="rounded-full bg-copper-50 px-2.5 py-0.5 text-xs font-medium text-copper-700">
                        Unsure
                      </span>
                    ) : null}
                    {c.outcome ? <StatusBadge status={c.outcome} /> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PageLayout>
  );
}

/** Compact supporting metric with a tiny flat sparkline slot. */
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-brand-800">
        {value}
      </p>
    </Card>
  );
}
