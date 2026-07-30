import Link from "next/link";

/**
 * App-wide 404. Signed-out visitors who mistype a URL land here, so it points
 * at both the marketing page and the dashboard rather than assuming which one
 * the person wanted.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <p className="font-display text-6xl font-bold text-brand-100">404</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-brand-800">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-2 text-muted">
          The link may be out of date, or the page may have moved.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Go to your dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
