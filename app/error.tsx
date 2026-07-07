"use client";

import { useEffect } from "react";

import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

/**
 * Root-level error boundary (audit fix, item 4). Catches any otherwise-uncaught
 * exception anywhere under the app (e.g. the `transcript.map` crash found
 * during the go-live audit when a row's shape didn't match what a page
 * expected) and shows a calm, on-brand message instead of Next's raw crash
 * screen. `app/dashboard/error.tsx` catches dashboard-specific errors first —
 * this is the final safety net for everything else (marketing/auth pages,
 * the onboarding tool, etc).
 *
 * Must be a Client Component (Next.js requirement for error boundaries).
 */
export default function GlobalErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Server Component errors already log server-side with their own digest;
    // this covers client-side render errors too. Never log more than the
    // message — see the PII-logging fix elsewhere in this codebase.
    console.error("[error-boundary]", error.message, error.digest ? `(digest: ${error.digest})` : "");
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted">
          That&apos;s on us, not you — nothing you did caused this. Try again,
          or head back to the dashboard.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-muted">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={() => unstable_retry()}>Try again</Button>
          <Button variant="secondary" asChild>
            <a href="/dashboard">Go to dashboard</a>
          </Button>
        </div>
      </Card>
    </div>
  );
}
