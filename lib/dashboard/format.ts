/**
 * Small presentation helpers shared across the dashboard pages. Kept pure and
 * dependency-free so both server components and (client) forms can use them.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Whole-dollar currency from integer cents, e.g. 35000 -> "$350". */
export function formatCents(cents: number): string {
  return USD.format(Math.round(cents) / 100);
}

/** Cents -> plain dollars string for editable inputs, e.g. 35000 -> "350". */
export function centsToDollarsInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toString();
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** e.g. "Jul 5, 3:42 PM" — for conversation/booking timestamps. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** e.g. "Jul 5, 2026" — for correction history. */
export function formatDate(iso: string): string {
  return DATE_ONLY.format(new Date(iso));
}

/** ISO string for the start of today (UTC). Used to scope "today" counts. */
export function startOfTodayISO(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return d.toISOString();
}

/** ISO string for 7 days ago. Used to scope "this week" revenue. */
export function sevenDaysAgoISO(now: Date = new Date()): string {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/** ISO string for N days ago, at the start of that UTC day. */
export function daysAgoISO(days: number, now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString();
}

/**
 * Buckets timestamped rows into a per-day count series over the last `days`
 * (oldest → newest), so a flat list of bookings becomes a trend line. Days with
 * no rows are 0, so the series is always exactly `days` long and gap-free — the
 * shape a sparkline expects. Pure; no I/O.
 */
export function dailySeries(
  timestamps: string[],
  days: number,
  now: Date = new Date(),
): number[] {
  const buckets = new Array(days).fill(0);
  const startMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ) - (days - 1) * 86_400_000;
  for (const iso of timestamps) {
    const t = new Date(iso).getTime();
    const idx = Math.floor((t - startMs) / 86_400_000);
    if (idx >= 0 && idx < days) buckets[idx] += 1;
  }
  return buckets;
}

/** Percent change of the last window vs the prior equal window; null if no prior basis. */
export function deltaPct(series: number[]): number | null {
  if (series.length < 2) return null;
  const half = Math.floor(series.length / 2);
  const prior = series.slice(0, half).reduce((a, b) => a + b, 0);
  const recent = series.slice(half).reduce((a, b) => a + b, 0);
  if (prior === 0) return recent > 0 ? 100 : null;
  return Math.round(((recent - prior) / prior) * 100);
}
