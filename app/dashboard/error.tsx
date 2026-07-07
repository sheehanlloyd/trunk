"use client";

import { useEffect } from "react";

import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

/**
 * Dashboard-level error boundary (audit fix, item 4). Wraps every page under
 * /dashboard (conversations, bookings, settings, knowledge, billing, and each
 * conversation/booking detail view). Catches the exact class of bug found
 * during the go-live audit — an unexpected row shape crashing a page with
 * `.map is not a function` — and any future one, showing a calm, on-brand
 * message instead of a raw crash screen. Owners using this from a job site are
 * non-technical and busy (design §13); a dead end here is worse than most bugs.
 *
 * Must be a Client Component (Next.js requirement for error boundaries).
 */
export default function DashboardErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error-boundary]", error.message, error.digest ? `(digest: ${error.digest})` : "");
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <Card className="max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          This page hit a snag
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your data is safe — this is just a display error. Try again, or go
          back to your dashboard home.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-muted">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={() => unstable_retry()}>Try again</Button>
          <Button variant="secondary" asChild>
            <a href="/dashboard">Dashboard home</a>
          </Button>
        </div>
      </Card>
    </div>
  );
}
