"use client";

import { useActionState } from "react";

import {
  generateInsightsAction,
  type InsightActionResult,
} from "@/app/dashboard/analytics/actions";
import { Button } from "@/components/shared/Button";

const INITIAL: InsightActionResult = { ok: false };

/**
 * The one client island on the analytics page. Submits the generate action
 * and holds the pending state — the run takes up to a couple of minutes of
 * model time, so the button locks with honest "Analyzing…" copy rather than
 * looking hung. On success the action revalidates the page and the fresh
 * report streams in server-side.
 */
export function GenerateInsightsButton({ hasExisting }: { hasExisting: boolean }) {
  const [state, formAction, pending] = useActionState(
    generateInsightsAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" loading={pending}>
        {pending
          ? "Analyzing…"
          : hasExisting
            ? "Regenerate insights"
            : "Generate insights"}
      </Button>
      {state.error && !pending ? (
        <p className="max-w-xs text-sm text-red-600 sm:text-right">{state.error}</p>
      ) : null}
    </form>
  );
}
