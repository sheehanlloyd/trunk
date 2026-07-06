import type { Metadata } from "next";
import Link from "next/link";

import { Card, StatCard } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import {
  formatCents,
  formatDateTime,
  sevenDaysAgoISO,
  startOfTodayISO,
} from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/database";

export const metadata: Metadata = { title: "Dashboard — AI Receptionist" };

/** Flagged = AI wasn't sure, or the request was unclear. These need a human look. */
const ATTENTION_FILTER = "ai_confidence_flag.eq.true,outcome.eq.unclear";

export default async function DashboardOverviewPage() {
  const context = await requireAuth();
  // Layout already handles the null case; guard for type-narrowing.
  if (!context) return null;

  const { business } = context;
  const supabase = await createClient();
  const todayStart = startOfTodayISO();
  const weekStart = sevenDaysAgoISO();

  // All queries below are automatically scoped to this tenant by RLS.
  const [conversationsToday, bookingsToday, needsAttention, weekBookings, attentionList] =
    await Promise.all([
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
      // "Jobs captured this week": bookings created in the last 7 days that the
      // owner hasn't canceled. Count × avg job value = revenue potential.
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekStart)
        .neq("status", "canceled"),
      supabase
        .from("conversations")
        .select("id, customer_name, customer_phone, outcome, ai_confidence_flag, channel, created_at")
        .or(ATTENTION_FILTER)
        .order("created_at", { ascending: false })
        .limit(5)
        .returns<
          Pick<
            Conversation,
            | "id"
            | "customer_name"
            | "customer_phone"
            | "outcome"
            | "ai_confidence_flag"
            | "channel"
            | "created_at"
          >[]
        >(),
    ]);

  const attentionCount = needsAttention.count ?? 0;
  const weekJobs = weekBookings.count ?? 0;
  const avgCents = business.average_job_value_cents;
  const revenue = avgCents != null ? weekJobs * avgCents : null;
  const flagged = attentionList.data ?? [];

  return (
    <PageLayout
      title="Dashboard"
      description="Your AI receptionist activity at a glance."
      actions={<StatusBadge status={business.status} />}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Conversations today"
          value={conversationsToday.count ?? 0}
          hint="Chats & calls handled"
        />
        <StatCard
          label="Bookings today"
          value={bookingsToday.count ?? 0}
          hint="New jobs captured"
        />

        {/* Needs-attention: the "look closer" signal (design §12). Warns in amber
            and links straight to the filtered list when there's anything to review. */}
        <Card
          className={
            attentionCount > 0
              ? "border-amber-300 bg-amber-50/40 p-5"
              : "p-5"
          }
        >
          <p className="text-sm font-medium text-[--color-muted]">
            Needs attention
          </p>
          <p
            className={
              "mt-2 text-3xl font-semibold tracking-tight " +
              (attentionCount > 0 ? "text-amber-700" : "text-slate-900")
            }
          >
            {attentionCount}
          </p>
          {attentionCount > 0 ? (
            <Link
              href="/dashboard/conversations?outcome=attention"
              className="mt-1 inline-block text-sm font-medium text-amber-700 underline underline-offset-2"
            >
              Review flagged chats
            </Link>
          ) : (
            <p className="mt-1 text-sm text-[--color-muted]">
              Nothing to review — nice
            </p>
          )}
        </Card>

        {/* Revenue: every number ties back to money (design §13). */}
        {revenue != null ? (
          <StatCard
            label="Jobs captured this week"
            value={formatCents(revenue)}
            hint={`${weekJobs} ${weekJobs === 1 ? "job" : "jobs"} × avg value`}
            tone="accent"
          />
        ) : (
          <Card className="p-5">
            <p className="text-sm font-medium text-[--color-muted]">
              Jobs captured this week
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-400">
              $—
            </p>
            <Link
              href="/dashboard/settings"
              className="mt-1 inline-block text-sm font-medium text-brand-700 underline underline-offset-2"
            >
              Set your avg job value
            </Link>
          </Card>
        )}
      </div>

      {flagged.length > 0 ? (
        <Card className="mt-6">
          <div className="border-b border-[--color-border] px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Needs a closer look
            </h2>
            <p className="mt-0.5 text-sm text-[--color-muted]">
              Conversations the AI wasn&apos;t sure about — tap to read.
            </p>
          </div>
          <ul className="divide-y divide-[--color-border]">
            {flagged.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {c.customer_name ?? c.customer_phone ?? "Unknown caller"}
                    </p>
                    <p className="mt-0.5 text-xs text-[--color-muted]">
                      {c.channel === "voice" ? "Call" : "Chat"} ·{" "}
                      {formatDateTime(c.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.ai_confidence_flag ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
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
