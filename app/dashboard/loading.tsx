/**
 * Route-level loading UI for every /dashboard page. A slow query now reads as
 * "loading" (skeleton matching the real home layout) rather than a hung blank
 * screen — important on a job-site connection. Purely presentational.
 */
export default function DashboardLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading your dashboard"
    >
      <div className="mb-6 h-8 w-40 animate-pulse rounded-lg bg-ink-100" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Revenue hero skeleton */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="h-4 w-32 animate-pulse rounded bg-ink-100" />
          <div className="mt-3 h-12 w-48 animate-pulse rounded-lg bg-ink-100" />
          <div className="mt-6 h-16 w-full animate-pulse rounded-lg bg-ink-50" />
        </div>
        {/* Secondary stats skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface p-5 shadow-card"
            >
              <div className="h-4 w-28 animate-pulse rounded bg-ink-100" />
              <div className="mt-3 h-8 w-12 animate-pulse rounded bg-ink-100" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 h-16 w-full animate-pulse rounded-xl bg-ink-50" />
    </div>
  );
}
