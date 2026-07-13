import type { Metadata } from "next";
import Link from "next/link";

import { GenerateInsightsButton } from "@/components/analytics/GenerateInsightsButton";
import { HoursHeatmap } from "@/components/analytics/HoursHeatmap";
import { InsightReport } from "@/components/analytics/InsightReport";
import { type BarSegment, SegmentBar } from "@/components/analytics/SegmentBar";
import { TrendChart } from "@/components/analytics/TrendChart";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageLayout,
  StatCard,
} from "@/components/shared";
import {
  type AnalyticsRow,
  channelCounts,
  clampPeriod,
  conversionRate,
  dailyTrend,
  dayLabels,
  hourlyHeatmap,
  outcomeCounts,
  PERIOD_OPTIONS,
} from "@/lib/analytics/aggregate";
import { requireAuth } from "@/lib/auth/session";
import { daysAgoISO, formatCents } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { ConversationOutcome, Insight } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

/** Sanity cap on rows aggregated in memory (~1 row/4min for 30 days). */
const MAX_ROWS = 10_000;

/**
 * Outcome segment order + colors. Follows the StatusBadge tone language
 * (booked=revenue, emergency=red/danger, no_action=neutral, voicemail=brand,
 * unclear=copper) — and the ORDER is deliberate: it was validated with the
 * dataviz palette checker so every adjacent pair stays distinguishable under
 * protan/deutan CVD (worst pair ΔE 9.0; copper may only neighbor brand).
 * Don't re-sort by count.
 */
const OUTCOME_SEGMENTS: {
  key: ConversationOutcome;
  label: string;
  color: string;
}[] = [
  { key: "booked", label: "Booked", color: "var(--color-revenue-600)" },
  // Tailwind red-600 — matches the danger tone; red isn't a custom token.
  { key: "emergency_escalated", label: "Emergency", color: "#dc2626" },
  { key: "no_action", label: "No action", color: "var(--color-ink-400)" },
  { key: "voicemail_left", label: "Voicemail", color: "var(--color-brand-600)" },
  { key: "unclear", label: "Unclear", color: "var(--color-copper-600)" },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const context = await requireAuth();
  // Layout already handles the null case; guard for type-narrowing.
  if (!context) return null;

  const { business } = context;
  const days = clampPeriod((await searchParams).days);
  const since = daysAgoISO(days);
  const supabase = await createClient();

  // One conversations fetch feeds every chart (aggregation is pure, in
  // memory); bookings and the latest insight ride alongside. RLS scopes all.
  const [convRes, bookingsRes, insightRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("created_at, outcome, channel")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS)
      .returns<AnalyticsRow[]>(),
    // Canceled bookings are excluded (as in the dashboard revenue trend) so
    // the count and the revenue estimate describe the same set of jobs.
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since)
      .neq("status", "canceled"),
    supabase
      .from("insights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Insight>(),
  ]);

  const rows = convRes.data ?? [];
  const bookings = bookingsRes.count ?? 0;
  const insight = insightRes.data ?? null;

  const trend = dailyTrend(rows, days);
  const outcomes = outcomeCounts(rows);
  const channels = channelCounts(rows);
  const conversion = conversionRate(outcomes.booked, rows.length);
  const avgCents = business.average_job_value_cents;
  const revenueCents = avgCents != null ? bookings * avgCents : null;

  const outcomeSegments: BarSegment[] = OUTCOME_SEGMENTS.map((s) => ({
    ...s,
    count: outcomes[s.key],
  }));
  const channelSegments: BarSegment[] = [
    { key: "chat", label: "Chat", count: channels.chat, color: "var(--color-brand-600)" },
    { key: "voice", label: "Voice", count: channels.voice, color: "var(--color-copper-600)" },
  ];

  return (
    <PageLayout
      title="Analytics"
      description={`What your AI receptionist handled over the last ${days} days.`}
      actions={
        <nav
          aria-label="Period"
          className="flex rounded-lg border border-border bg-surface p-0.5 shadow-card"
        >
          {PERIOD_OPTIONS.map((d) => (
            <Link
              key={d}
              href={d === 30 ? "/dashboard/analytics" : `/dashboard/analytics?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                d === days
                  ? "bg-brand-600 text-white"
                  : "text-muted hover:text-brand-800",
              )}
            >
              {d}d
            </Link>
          ))}
        </nav>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Conversations" value={rows.length} />
        <StatCard label="Bookings" value={bookings} />
        <StatCard
          label="Booking conversion"
          value={conversion == null ? "—" : `${conversion}%`}
          hint="Booked ÷ conversations"
        />
        <StatCard
          label="Est. revenue captured"
          tone="accent"
          value={revenueCents == null ? "—" : formatCents(revenueCents)}
          hint={
            avgCents == null ? (
              <Link
                href="/dashboard/settings"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Set your average job value
              </Link>
            ) : (
              `${bookings} bookings × ${formatCents(avgCents)}`
            )
          }
        />
      </div>

      {rows.length === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <p className="font-display text-base font-semibold text-brand-800">
            No conversations in this period yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Once customers start chatting or calling, your trends, outcomes, and
            peak hours will appear here. Try a longer period, or share your chat
            widget to get things moving.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Daily activity</CardTitle>
            </CardHeader>
            <CardBody>
              <TrendChart
                total={trend.total}
                booked={trend.booked}
                labels={dayLabels(days)}
              />
            </CardBody>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Outcomes</CardTitle>
              </CardHeader>
              <CardBody>
                <SegmentBar id="outcomes" segments={outcomeSegments} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Channel</CardTitle>
              </CardHeader>
              <CardBody>
                <SegmentBar id="channels" segments={channelSegments} />
              </CardBody>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <div>
                <CardTitle>Peak hours</CardTitle>
                <p className="mt-0.5 text-sm text-muted">
                  When customers reach out, by day and hour.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <HoursHeatmap grid={hourlyHeatmap(rows)} />
            </CardBody>
          </Card>
        </>
      )}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-brand-800">
              AI insights
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Claude reads your last 30 days of conversations and reports what
              customers ask, where your AI needs info, and fixes to apply.
            </p>
          </div>
          <GenerateInsightsButton hasExisting={insight != null} />
        </div>

        {insight ? (
          <Card>
            <CardBody className="py-5">
              <InsightReport insight={insight} />
            </CardBody>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted">
              No report yet. Generate one to see your customers&apos; top
              questions and ready-to-apply knowledge fixes — it takes about a
              minute.
            </p>
          </Card>
        )}
      </section>
    </PageLayout>
  );
}
