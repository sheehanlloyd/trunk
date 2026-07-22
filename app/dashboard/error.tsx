"use client";

import { useEffect } from "react";

/**
 * Dashboard error boundary. Without it, a failed query in any dashboard page
 * shows Next's default error screen — alarming for a non-technical owner who
 * mostly needs "try again" and a way to reach a human. The digest is surfaced
 * so a support conversation can be matched to server logs; the raw message is
 * not, since it can carry query details.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-card">
        <span
          aria-hidden
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-copper-50 text-copper-600"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </span>
        <h1 className="font-display text-lg font-semibold text-brand-800">
          Something went wrong loading this page
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your data is safe — this was a problem on our side. Try again, and if it
          keeps happening let us know.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Try again
        </button>
        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-ink-300">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
