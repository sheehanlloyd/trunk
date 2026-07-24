import type { Metadata } from "next";
import Link from "next/link";

import { type BarSegment, SegmentBar } from "@/components/analytics/SegmentBar";
import { mondayOfWeekUTC } from "@/components/dashboard/BookingsCalendar";
import { PrintButton } from "@/components/dashboard/PrintButton";
import { Card, StatCard } from "@/components/shared/Card";
import {
  type AnalyticsRow,
  conversionRate,
  outcomeCounts,
} from "@/lib/analytics/aggregate";
import { requireAuth } from "@/lib/auth/session";
import {
  deltaPct,
  formatCents,
  formatDateTime,
  leadReasonLabel,
} from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Booking, ConversationOutcome, Lead } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Weekly report" };

/**
 * One-page owner report for a Monday-start week, designed to be read on screen
 * or printed to PDF (the share path — see PrintButton). Everything is
 * server-rendered; the only client bit is the print trigger.
 */

const MS_PER_DAY = 86_400_000;

/** Sanity caps on rows aggregated in memory for one week. */
const MAX_CONVERSATIONS = 10_000;
const MAX_BOOKINGS = 2_000;
const MAX_LEADS = 500;

/** ?week= must be a real YYYY-MM-DD date; anything else means "this week". */
function parseWeekParam(raw: string | undefined): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

const RANGE_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const RANGE_LABEL_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "3 jobs" / "1 job" — keeps the summary sentence grammatical. */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Outcome segment order + colors — same validated set as the analytics page
 * (CVD-safe adjacency in this order; don't re-sort by count).
 */
const OUTCOME_SEGMENTS: {
  key: ConversationOutcome;
  label: string;
  color: string;
}[] = [
  { key: "booked", label: "Booked", color: "var(--color-revenue-600)" },
  { key: "emergency_escalated", label: "Emergency", color: "#dc2626" },
  { key: "no_action", label: "No action", color: "var(--color-ink-400)" },
  { key: "voicemail_left", label: "Voicemail", color: "var(--color-brand-600)" },
  { key: "unclear", label: "Unclear", color: "var(--color-copper-600)" },
];

/** Small "+12% vs last week" delta next to a stat. Up is good for every stat
 *  on this page (a conversion drop is just as bad as a bookings drop). */
function Delta({ value, unit }: { value: number | null; unit: "%" | "pts" }) {
  if (value == null) {
    return <span className="text-xs text-muted">— vs last week</span>;
  }
  const flat = value === 0;
  const up = value > 0;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        flat ? "text-ink-500" : up ? "text-revenue-600" : "text-copper-600",
      )}
    >
      {flat ? "±0" : `${up ? "+" : "−"}${Math.abs(value)}`}
      {unit === "pts" ? " pts" : "%"} vs last week
    </span>
  );
}

/** Clean bar list for the week's top requested services. */
function ServiceBars({ services }: { services: { label: string; count: number }[] }) {
  if (services.length === 0) {
    return <p className="text-sm text-muted">No bookings this week.</p>;
  }
  const max = services[0].count;
  return (
    <ul className="space-y-3">
      {services.map((s) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm text-ink-700">{s.label}</p>
            <p className="font-display text-sm font-semibold text-brand-800">
              {s.count}
            </p>
          </div>
          <div className="mt-1 h-2 rounded-full bg-ink-100">
            <div
              className="h-2 rounded-full bg-brand-500"
              style={{ width: `${Math.max((s.count / max) * 100, 4)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const context = await requireAuth();
  if (!context) return null;
  const { business } = context;

  const params = await searchParams;
  const weekStart = mondayOfWeekUTC(parseWeekParam(params.week));
  const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
  const prevStart = new Date(weekStart.getTime() - 7 * MS_PER_DAY);
  const prevISO = prevStart.toISOString().slice(0, 10);
  const isCurrentWeek =
    weekStart.getTime() === mondayOfWeekUTC(new Date()).getTime();

  const supabase = await createClient();

  // One two-week fetch per table, split into current/previous in code — the
  // comparison week rides along for free. RLS scopes everything to the tenant.
  const [convRes, bookingsRes, leadsRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("created_at, outcome, channel")
      .gte("created_at", prevStart.toISOString())
      .lt("created_at", weekEnd.toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_CONVERSATIONS)
      .returns<AnalyticsRow[]>(),
    supabase
      .from("bookings")
      .select("*")
      .gte("created_at", prevStart.toISOString())
      .lt("created_at", weekEnd.toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_BOOKINGS)
      .returns<Booking[]>(),
    supabase
      .from("leads")
      .select("*")
      .is("resolved_at", null)
      .gte("created_at", weekStart.toISOString())
      .lt("created_at", weekEnd.toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_LEADS)
      .returns<Lead[]>(),
  ]);

  const splitByWeek = <T extends { created_at: string }>(rows: T[]): [T[], T[]] => [
    rows.filter((r) => r.created_at < weekStart.toISOString()),
    rows.filter((r) => r.created_at >= weekStart.toISOString()),
  ];

  const [prevConvs, convs] = splitByWeek(convRes.data ?? []);
  // Canceled bookings are excluded (as on the analytics page) so the count
  // and the revenue estimate describe the same set of jobs.
  const [prevBookings, bookings] = splitByWeek(
    (bookingsRes.data ?? []).filter((b) => b.status !== "canceled"),
  );
  const leads = leadsRes.data ?? [];

  const outcomes = outcomeCounts(convs);
  const conversion = conversionRate(outcomes.booked, convs.length);
  const prevConversion = conversionRate(
    outcomeCounts(prevConvs).booked,
    prevConvs.length,
  );

  const avgCents = business.average_job_value_cents;
  const revenueCents = avgCents != null ? bookings.length * avgCents : null;

  const convDelta = deltaPct([prevConvs.length, convs.length]);
  const bookingsDelta = deltaPct([prevBookings.length, bookings.length]);
  const conversionDelta =
    conversion != null && prevConversion != null
      ? conversion - prevConversion
      : null;

  // Top requested services, counted case-insensitively but shown as typed.
  const serviceCounts = new Map<string, { label: string; count: number }>();
  for (const b of bookings) {
    const label = b.requested_service?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const entry = serviceCounts.get(key);
    if (entry) entry.count += 1;
    else serviceCounts.set(key, { label, count: 1 });
  }
  const topServices = [...serviceCounts.values()]
    .sort((a, z) => z.count - a.count)
    .slice(0, 5);

  const outcomeSegments: BarSegment[] = OUTCOME_SEGMENTS.map((s) => ({
    ...s,
    count: outcomes[s.key],
  }));

  const weekPhrase = isCurrentWeek
    ? "this week"
    : `during the week of ${RANGE_LABEL.format(weekStart)}`;
  const summary =
    `Trunk answered ${plural(convs.length, "conversation")} and booked ` +
    `${plural(bookings.length, "job")}` +
    (revenueCents != null && bookings.length > 0
      ? ` worth an estimated ${formatCents(revenueCents)}`
      : "") +
    ` ${weekPhrase}.`;

  const navLinkClass =
    "rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium " +
    "text-ink-900 hover:bg-ink-50";

  return (
    <div className="weekly-report mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
      {/*
        Print reset, scoped to this route's render: the dashboard shell's
        NavBar is an <aside> (desktop) / <header> (mobile) we can't edit, so
        hide those tags and strip main's flex padding when printing. Colors
        are forced exact so stat tints and chart segments survive the printer
        driver's "save ink" default.
      */}
      <style>{`
        @media print {
          aside, header { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .weekly-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">{business.name}</p>
          <h1 className="font-display text-2xl font-bold text-brand-800">
            Weekly report
          </h1>
          <p className="mt-1 text-sm text-muted">
            {RANGE_LABEL.format(weekStart)} –{" "}
            {RANGE_LABEL_YEAR.format(
              new Date(weekEnd.getTime() - MS_PER_DAY),
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Link
            href={`/dashboard/reports?week=${prevISO}`}
            className={navLinkClass}
          >
            ← Previous week
          </Link>
          {!isCurrentWeek ? (
            <Link href="/dashboard/reports" className={navLinkClass}>
              This week
            </Link>
          ) : null}
          <PrintButton />
        </div>
      </div>

      <p className="mb-6 text-base leading-relaxed text-ink-800">{summary}</p>

      <div className="grid grid-cols-2 gap-4 break-inside-avoid lg:grid-cols-4 print:grid-cols-4">
        <StatCard
          label="Conversations"
          value={convs.length}
          hint={<Delta value={convDelta} unit="%" />}
        />
        <StatCard
          label="Bookings"
          value={bookings.length}
          hint={<Delta value={bookingsDelta} unit="%" />}
        />
        <StatCard
          label="Booking conversion"
          value={conversion == null ? "—" : `${conversion}%`}
          hint={<Delta value={conversionDelta} unit="pts" />}
        />
        <StatCard
          label="Est. revenue"
          tone="accent"
          value={revenueCents == null ? "—" : formatCents(revenueCents)}
          hint={
            avgCents == null ? (
              <span className="text-xs text-muted">
                Set your average job value in Settings
              </span>
            ) : (
              // Bookings × a fixed average moves exactly like bookings do.
              <Delta value={bookingsDelta} unit="%" />
            )
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="break-inside-avoid p-5">
          <h2 className="font-display mb-4 text-base font-semibold text-brand-800">
            Top requested services
          </h2>
          <ServiceBars services={topServices} />
        </Card>
        <Card className="break-inside-avoid p-5">
          <h2 className="font-display mb-4 text-base font-semibold text-brand-800">
            Conversation outcomes
          </h2>
          {convs.length === 0 ? (
            <p className="text-sm text-muted">No conversations this week.</p>
          ) : (
            <SegmentBar id="report-outcomes" segments={outcomeSegments} />
          )}
        </Card>
      </div>

      <Card className="mt-4 break-inside-avoid p-5">
        <h2 className="font-display text-base font-semibold text-brand-800">
          Leads to call back
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          {/* One interpolated string: JSX collapses the space around a mid-
              sentence expression, which silently ran two words together. */}
          {`Customers who reached out ${weekPhrase} but didn't book — still open in your `}
          <Link
            href="/dashboard/leads"
            className="text-brand-700 underline underline-offset-2 print:no-underline"
          >
            leads queue
          </Link>
          .
        </p>
        {leads.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No open leads from this week — nothing slipped through.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {leads.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {lead.customer_name ?? "Unknown customer"}
                    {lead.customer_phone ? (
                      <span className="ml-2 font-normal text-ink-700">
                        {lead.customer_phone}
                      </span>
                    ) : null}
                  </p>
                  {lead.requested_service || lead.reason ? (
                    <p className="mt-0.5 text-xs text-muted">
                      {[lead.requested_service, leadReasonLabel(lead.reason)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-xs text-muted">
                  {formatDateTime(lead.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-6 text-xs text-muted">
        Generated by Trunk, {business.name}&apos;s AI receptionist.
      </p>
    </div>
  );
}
