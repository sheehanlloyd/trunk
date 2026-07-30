/**
 * Shared dashboard loading skeleton. Every page here is a server component
 * doing real queries, so without this a navigation shows nothing until the
 * data lands. Mirrors the common shape (title block + stat row + panel) so
 * the swap to real content doesn't jump.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-ink-100" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-ink-100" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-surface p-5 shadow-card"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-ink-100" />
            <div className="mt-3 h-8 w-20 animate-pulse rounded-lg bg-ink-100" />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="h-5 w-36 animate-pulse rounded bg-ink-100" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-ink-50" />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
