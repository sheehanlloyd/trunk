import Link from "next/link";

/**
 * Urgent strip shown above everything on the dashboard home when emergencies
 * were escalated in the last 24h. The one place true red is allowed in the app
 * — an emergency the owner missed is the worst failure mode this product can
 * have, so it outranks even the revenue hero. Links straight to the filtered
 * conversations list (`outcome=emergency_escalated` is a real filter there).
 */
export function EmergencyBanner({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <Link
      href="/dashboard/conversations?outcome=emergency_escalated"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 shadow-card transition-colors hover:bg-red-100"
    >
      <div className="flex items-center gap-3">
        {/* Triangle-alert glyph — inline so no icon dependency is added. */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-6 w-6 shrink-0 text-red-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <span className="text-sm font-medium text-red-700">
          <span className="font-display text-base font-bold text-red-600">
            {count}
          </span>{" "}
          {count === 1 ? "Emergency call" : "Emergency calls"} in the last 24
          hours — make sure someone followed up.
        </span>
      </div>
      <span aria-hidden className="shrink-0 text-red-600">
        →
      </span>
    </Link>
  );
}
