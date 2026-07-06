import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import { formatDateTime, startOfTodayISO } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Conversation, ConversationOutcome } from "@/lib/types/database";

export const metadata: Metadata = { title: "Conversations — AI Receptionist" };

const ATTENTION_FILTER = "ai_confidence_flag.eq.true,outcome.eq.unclear";

/** Outcome dropdown options; "attention" is a pseudo-filter for flagged chats. */
const OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All outcomes" },
  { value: "attention", label: "Needs attention" },
  { value: "booked", label: "Booked" },
  { value: "no_action", label: "No action" },
  { value: "unclear", label: "Unclear" },
  { value: "emergency_escalated", label: "Emergency" },
  { value: "voicemail_left", label: "Voicemail" },
];

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const REAL_OUTCOMES: ConversationOutcome[] = [
  "booked",
  "no_action",
  "unclear",
  "emergency_escalated",
  "voicemail_left",
];

function rangeStartISO(range: string): string | null {
  if (range === "today") return startOfTodayISO();
  if (range === "7d") return new Date(Date.now() - 7 * 86_400_000).toISOString();
  if (range === "30d") return new Date(Date.now() - 30 * 86_400_000).toISOString();
  return null;
}

type ConversationRow = Pick<
  Conversation,
  | "id"
  | "customer_name"
  | "customer_phone"
  | "outcome"
  | "ai_confidence_flag"
  | "channel"
  | "created_at"
>;

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; range?: string }>;
}) {
  const context = await requireAuth();
  if (!context) return null;

  const params = await searchParams;
  const outcome = params.outcome ?? "all";
  const range = params.range ?? "all";

  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select(
      "id, customer_name, customer_phone, outcome, ai_confidence_flag, channel, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (outcome === "attention") {
    query = query.or(ATTENTION_FILTER);
  } else if (REAL_OUTCOMES.includes(outcome as ConversationOutcome)) {
    query = query.eq("outcome", outcome);
  }

  const start = rangeStartISO(range);
  if (start) query = query.gte("created_at", start);

  const { data } = await query.returns<ConversationRow[]>();
  const rows = data ?? [];

  return (
    <PageLayout
      title="Conversations"
      description="Every chat and call your AI has handled."
    >
      {/* Plain GET form so filtering works even before JS loads. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[--color-muted]">
          Outcome
          <select
            name="outcome"
            defaultValue={outcome}
            className="h-11 min-w-40 rounded-lg border border-[--color-border] bg-white px-3 text-sm text-slate-900"
          >
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[--color-muted]">
          Date
          <select
            name="range"
            defaultValue={range}
            className="h-11 min-w-40 rounded-lg border border-[--color-border] bg-white px-3 text-sm text-slate-900"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply
        </button>
      </form>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[--color-muted]">
            No conversations match these filters yet.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[--color-border]">
            {rows.map((c) => {
              const flagged = c.ai_confidence_flag || c.outcome === "unclear";
              return (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/conversations/${c.id}`}
                    className={
                      "flex items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5 " +
                      (flagged
                        ? "border-l-4 border-amber-400"
                        : "border-l-4 border-transparent")
                    }
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
              );
            })}
          </ul>
        </Card>
      )}
    </PageLayout>
  );
}
