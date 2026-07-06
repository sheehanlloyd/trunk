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
