import Link from "next/link";

import { Card } from "@/components/shared/Card";
import { cn } from "@/lib/utils";
import type { Booking, BookingStatus } from "@/lib/types/database";

/**
 * Week view of bookings (v2). Server-rendered — navigation is plain links that
 * change the ?week= search param, chips are anchors into the list view.
 *
 * Placement honesty: `preferred_time` is free text the AI captured ("tomorrow
 * morning", "Friday 2pm") and can't be parsed reliably, so bookings are placed
 * on the day they were *captured* (created_at, UTC — matching how the rest of
 * the dashboard buckets days) and each chip shows the preferred-time text
 * prominently. That text is the real scheduling signal for the owner.
 */

const MS_PER_DAY = 86_400_000;

/** Chip colors per status — same tone mapping as StatusBadge. */
const chipStyles: Record<BookingStatus, string> = {
  new: "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100",
  confirmed:
    "border-revenue-200 bg-revenue-50 text-revenue-700 hover:bg-revenue-100",
  owner_contacted: "border-ink-200 bg-ink-100 text-ink-700 hover:bg-ink-200",
  canceled: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
};

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});
const DAY_NUM = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: "UTC",
});
const RANGE_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "YYYY-MM-DD" (UTC) for a date. */
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday (UTC midnight) of the week containing `d`. Exported for the page. */
export function mondayOfWeekUTC(d: Date): Date {
  const day = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day;
}

function BookingChip({ booking }: { booking: Booking }) {
  return (
    <a
      href={`/dashboard/bookings?view=list#booking-${booking.id}`}
      className={cn(
        "block rounded-lg border px-2 py-1.5 transition-colors",
        chipStyles[booking.status],
      )}
    >
      <p className="text-xs font-semibold leading-snug">
        {booking.preferred_time ?? "No time given"}
      </p>
      <p className="mt-0.5 truncate text-[11px] leading-snug opacity-80">
        {booking.customer_name ?? "Unknown customer"}
        {booking.requested_service ? ` · ${booking.requested_service}` : ""}
      </p>
    </a>
  );
}

export function BookingsCalendar({
  bookings,
  weekStartISO,
}: {
  /** Bookings created within the displayed week. */
  bookings: Booking[];
  /** Monday of the displayed week, as "YYYY-MM-DD" (UTC). */
  weekStartISO: string;
}) {
  const weekStart = new Date(`${weekStartISO}T00:00:00Z`);
  const startMs = weekStart.getTime();
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(startMs + i * MS_PER_DAY),
  );
  const todayISO = toISODate(new Date());

  // Bucket bookings into day columns by created_at (UTC), oldest first.
  const byDay: Booking[][] = Array.from({ length: 7 }, () => []);
  for (const b of bookings) {
    const idx = Math.floor((new Date(b.created_at).getTime() - startMs) / MS_PER_DAY);
    if (idx >= 0 && idx < 7) byDay[idx].push(b);
  }
  for (const col of byDay) {
    col.sort((a, z) => a.created_at.localeCompare(z.created_at));
  }

  const prevISO = toISODate(new Date(startMs - 7 * MS_PER_DAY));
  const nextISO = toISODate(new Date(startMs + 7 * MS_PER_DAY));
  const weekEnd = days[6];

  const navLinkClass =
    "rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium " +
    "text-ink-900 hover:bg-ink-50";

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-900">
          {RANGE_LABEL.format(weekStart)} – {RANGE_LABEL.format(weekEnd)}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/bookings?view=week&week=${prevISO}`}
            aria-label="Previous week"
            className={navLinkClass}
          >
            ←
          </Link>
          <Link
            href="/dashboard/bookings?view=week"
            className={navLinkClass}
          >
            Today
          </Link>
          <Link
            href={`/dashboard/bookings?view=week&week=${nextISO}`}
            aria-label="Next week"
            className={navLinkClass}
          >
            →
          </Link>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="grid min-w-[840px] grid-cols-7 gap-2">
          {days.map((day, i) => {
            const iso = toISODate(day);
            const isToday = iso === todayISO;
            return (
              <div key={iso} className="min-w-0">
                <div
                  className={cn(
                    "mb-2 rounded-lg px-2 py-1 text-center",
                    isToday ? "bg-brand-600 text-white" : "text-muted",
                  )}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide">
                    {DAY_LABEL.format(day)}
                  </p>
                  <p className="text-sm font-semibold">{DAY_NUM.format(day)}</p>
                </div>
                <div className="space-y-1.5">
                  {byDay[i].length === 0 ? (
                    <p className="py-2 text-center text-xs text-ink-300">—</p>
                  ) : (
                    byDay[i].map((b) => <BookingChip key={b.id} booking={b} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-xs text-muted">
        Bookings appear on the day your AI captured them; the time on each card
        is the customer&apos;s requested time, in their own words.
      </p>
    </Card>
  );
}
