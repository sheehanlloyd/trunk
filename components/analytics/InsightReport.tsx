import Link from "next/link";

import { formatDate } from "@/lib/dashboard/format";
import type { Insight } from "@/lib/types/database";

/**
 * Renders one stored AI insights report (insights.content). Sections with
 * nothing to say are omitted entirely — an empty "gaps" list reads as good
 * news in the headline, not as a blank panel.
 */

const STAT_LABELS: { key: keyof Insight["content"]["stats"]; label: string }[] = [
  { key: "conversations", label: "Conversations" },
  { key: "bookings", label: "Bookings" },
  { key: "leads", label: "Leads" },
  { key: "emergencies", label: "Emergencies" },
];

export function InsightReport({ insight }: { insight: Insight }) {
  const content = insight.content;
  const maxQuestionCount = Math.max(
    1,
    ...content.top_questions.map((q) => q.count),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-lg font-semibold text-brand-800">
          {content.headline}
        </p>
        <p className="mt-1 text-xs text-muted">
          Generated {formatDate(insight.created_at)} · covers{" "}
          {formatDate(insight.period_start)} – {formatDate(insight.period_end)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg bg-ink-50 px-3 py-2.5">
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="font-display mt-0.5 text-xl font-semibold text-brand-800">
              {content.stats[key]}
            </dd>
          </div>
        ))}
      </dl>

      {content.top_questions.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">
            What customers asked most
          </h3>
          <ul className="space-y-2">
            {content.top_questions.map((q) => (
              <li key={q.question} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-sm text-ink-700">
                  {q.question}
                </span>
                {/* Tiny magnitude bar — same brand wash as the trend chart. */}
                <span
                  aria-hidden
                  className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink-100"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.round((q.count / maxQuestionCount) * 100)}%`,
                      backgroundColor: "var(--color-brand-400)",
                    }}
                  />
                </span>
                <span className="font-display w-8 shrink-0 text-right text-sm font-semibold text-brand-800">
                  {q.count}×
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.gaps.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">
            Where your AI lacked information
          </h3>
          <ul className="space-y-1.5">
            {content.gaps.map((gap) => (
              <li key={gap} className="flex gap-2 text-sm text-ink-700">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-copper-600" />
                {gap}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.suggested_corrections.length > 0 ? (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-ink-900">
            Suggested corrections
          </h3>
          <p className="mb-3 text-xs text-muted">
            Add the ones you agree with from the{" "}
            <Link
              href="/dashboard/knowledge"
              className="font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              Knowledge page
            </Link>{" "}
            — they take effect on the next conversation.
          </p>
          <ul className="space-y-3">
            {content.suggested_corrections.map((c) => (
              <li
                key={`${c.original}→${c.corrected}`}
                className="rounded-lg border border-border bg-ink-50 p-3 text-sm"
              >
                <p className="text-muted">
                  <span className="mr-1.5 text-xs font-medium uppercase tracking-wide">
                    AI said
                  </span>
                  {c.original}
                </p>
                <p className="mt-1.5 text-ink-800">
                  <span className="mr-1.5 text-xs font-medium uppercase tracking-wide text-revenue-700">
                    Should say
                  </span>
                  {c.corrected}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
