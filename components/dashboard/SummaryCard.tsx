"use client";

import { useActionState } from "react";

import { summarizeConversation } from "@/app/dashboard/conversations/actions";
import type { ActionResult } from "@/app/dashboard/conversations/actions";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

/**
 * The AI-summary card at the top of a conversation detail page. Shows the
 * stored summary with a regenerate button, or a "Summarize" call-to-action
 * when none exists yet. The action revalidates the page, so the fresh summary
 * streams in through the server component's `summary` prop.
 */
export function SummaryCard({
  conversationId,
  summary,
}: {
  conversationId: string;
  summary: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async () => summarizeConversation(conversationId),
    { ok: true },
  );

  return (
    <Card className="mb-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          AI summary
        </p>
        <form action={formAction}>
          <Button type="submit" variant="secondary" size="sm" loading={pending}>
            {pending
              ? "Summarizing…"
              : summary
                ? "Regenerate"
                : "Summarize"}
          </Button>
        </form>
      </div>

      {summary ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-900">{summary}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Get a quick plain-English recap of this conversation — what the
          customer wanted, what happened, and any follow-up needed.
        </p>
      )}

      {!state.ok && state.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </Card>
  );
}
