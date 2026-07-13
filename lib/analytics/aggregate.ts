import type {
  ConversationChannel,
  ConversationOutcome,
} from "@/lib/types/database";

/**
 * Pure aggregation helpers for the analytics page. Everything here is
 * dependency-free and I/O-free (unit-tested in aggregate.test.ts): the page
 * fetches raw conversation rows once and derives every chart from them in
 * memory, so a period render costs one query regardless of how many charts
 * we add. Day bucketing is UTC to match lib/dashboard/format's dailySeries.
 */

/** The minimal slice of a conversation row the analytics charts need. */
export interface AnalyticsRow {
  created_at: string;
  outcome: ConversationOutcome | null;
  channel: ConversationChannel;
}

export const PERIOD_OPTIONS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

/** Parses ?days= into a supported period; anything else falls back to 30. */
export function clampPeriod(raw: string | undefined): PeriodDays {
  const n = Number.parseInt(raw ?? "", 10);
  return (PERIOD_OPTIONS as readonly number[]).includes(n)
    ? (n as PeriodDays)
    : 30;
}

const DAY_MS = 86_400_000;

/** Epoch ms for the start of the UTC day `days - 1` days before `now` — the
 *  same window origin as daysAgoISO, so charts and queries agree on day 0. */
function periodStartMs(days: number, now: Date): number {
  return (
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    (days - 1) * DAY_MS
  );
}

export interface DailyTrend {
  /** Conversations per UTC day, oldest → newest, gap-free (`days` long). */
  total: number[];
  /** The `booked`-outcome subset of `total`, same shape — always ≤ total per
   *  day, so the two series can share one axis and even one bar. */
  booked: number[];
}

/** Buckets rows into per-day total + booked counts. Rows outside the window
 *  are ignored rather than clamped, so a stale cache can't skew the edges. */
export function dailyTrend(
  rows: AnalyticsRow[],
  days: number,
  now: Date = new Date(),
): DailyTrend {
  const total = new Array<number>(days).fill(0);
  const booked = new Array<number>(days).fill(0);
  const startMs = periodStartMs(days, now);
  for (const row of rows) {
    const t = new Date(row.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const idx = Math.floor((t - startMs) / DAY_MS);
    if (idx < 0 || idx >= days) continue;
    total[idx] += 1;
    if (row.outcome === "booked") booked[idx] += 1;
  }
  return { total, booked };
}

/** Short axis/tooltip labels ("Jul 15") for each bucket of dailyTrend, in the
 *  same UTC frame so a bar and its label can never disagree about the date. */
export function dayLabels(days: number, now: Date = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  const startMs = periodStartMs(days, now);
  return Array.from({ length: days }, (_, i) =>
    fmt.format(new Date(startMs + i * DAY_MS)),
  );
}

const OUTCOME_KEYS: ConversationOutcome[] = [
  "booked",
  "no_action",
  "unclear",
  "emergency_escalated",
  "voicemail_left",
];

/** Counts rows per outcome. A null outcome (a conversation that just trailed
 *  off) counts as no_action — the same "general activity" bucket the daily
 *  digest uses — so the breakdown always sums to the row count. */
export function outcomeCounts(
  rows: AnalyticsRow[],
): Record<ConversationOutcome, number> {
  const counts = Object.fromEntries(OUTCOME_KEYS.map((k) => [k, 0])) as Record<
    ConversationOutcome,
    number
  >;
  for (const row of rows) {
    const key = row.outcome ?? "no_action";
    if (key in counts) counts[key] += 1;
  }
  return counts;
}

/** Counts rows per channel (chat vs voice). Unknown values are dropped. */
export function channelCounts(
  rows: AnalyticsRow[],
): Record<ConversationChannel, number> {
  const counts: Record<ConversationChannel, number> = { chat: 0, voice: 0 };
  for (const row of rows) {
    if (row.channel in counts) counts[row.channel] += 1;
  }
  return counts;
}

/** Monday-first weekday index for hourlyHeatmap (business weeks start Monday). */
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * Buckets rows into a 7×24 grid of counts — grid[day][hour], Monday-first.
 * `timeZone` is any IANA zone; omitted, it uses the runtime's zone. Businesses
 * don't store a timezone yet, so the server's zone is the best available proxy
 * for "local business hours" — pass the real zone here once that field exists.
 */
export function hourlyHeatmap(
  rows: AnalyticsRow[],
  timeZone?: string,
): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  });
  for (const row of rows) {
    const date = new Date(row.created_at);
    if (Number.isNaN(date.getTime())) continue;
    let day = -1;
    let hour = -1;
    for (const part of fmt.formatToParts(date)) {
      if (part.type === "weekday") day = WEEKDAY_INDEX[part.value] ?? -1;
      if (part.type === "hour") hour = Number.parseInt(part.value, 10);
    }
    if (day >= 0 && hour >= 0 && hour < 24) grid[day][hour] += 1;
  }
  return grid;
}

export interface HeatmapPeak {
  /** Monday-first day index into the grid. */
  day: number;
  hour: number;
  count: number;
}

/** The busiest cell of an hourlyHeatmap grid, or null when everything is 0 —
 *  so an empty account gets honest copy instead of a fake "peak at midnight". */
export function heatmapPeak(grid: number[][]): HeatmapPeak | null {
  let best: HeatmapPeak | null = null;
  grid.forEach((row, day) =>
    row.forEach((count, hour) => {
      if (count > 0 && (best === null || count > best.count)) {
        best = { day, hour, count };
      }
    }),
  );
  return best;
}

/** Whole-percent booking conversion (booked ÷ total), or null when there's no
 *  denominator — the caller renders "—" rather than a misleading 0%. */
export function conversionRate(booked: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((booked / total) * 100);
}
