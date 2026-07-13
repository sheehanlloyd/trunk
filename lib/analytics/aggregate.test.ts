import { describe, expect, it } from "vitest";

import {
  type AnalyticsRow,
  channelCounts,
  clampPeriod,
  conversionRate,
  dailyTrend,
  dayLabels,
  heatmapPeak,
  hourlyHeatmap,
  outcomeCounts,
} from "./aggregate";

/** Fixed "now" mid-day UTC so day-boundary math is unambiguous in every zone. */
const NOW = new Date("2026-08-13T12:00:00Z");

function row(
  created_at: string,
  outcome: AnalyticsRow["outcome"] = "no_action",
  channel: AnalyticsRow["channel"] = "chat",
): AnalyticsRow {
  return { created_at, outcome, channel };
}

describe("clampPeriod", () => {
  it("accepts only the supported periods", () => {
    expect(clampPeriod("7")).toBe(7);
    expect(clampPeriod("30")).toBe(30);
    expect(clampPeriod("90")).toBe(90);
  });

  it("falls back to 30 for anything else", () => {
    expect(clampPeriod(undefined)).toBe(30);
    expect(clampPeriod("14")).toBe(30);
    expect(clampPeriod("-7")).toBe(30);
    expect(clampPeriod("abc")).toBe(30);
  });
});

describe("dailyTrend", () => {
  it("returns gap-free zero series for no rows", () => {
    const t = dailyTrend([], 7, NOW);
    expect(t.total).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(t.booked).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("buckets by UTC day with today as the last bucket", () => {
    const t = dailyTrend(
      [
        row("2026-08-13T00:30:00Z", "booked"), // today
        row("2026-08-13T09:00:00Z"),
        row("2026-08-07T23:59:59Z"), // oldest in-window day
      ],
      7,
      NOW,
    );
    expect(t.total).toEqual([1, 0, 0, 0, 0, 0, 2]);
    expect(t.booked).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it("ignores rows outside the window and unparsable timestamps", () => {
    const t = dailyTrend(
      [
        row("2026-08-06T12:00:00Z"), // one day before the 7-day window
        row("2026-08-14T12:00:00Z"), // the future
        row("not-a-date"),
      ],
      7,
      NOW,
    );
    expect(t.total).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("keeps booked a per-day subset of total", () => {
    const t = dailyTrend(
      [
        row("2026-08-13T01:00:00Z", "booked"),
        row("2026-08-13T02:00:00Z", "booked"),
        row("2026-08-13T03:00:00Z", "unclear"),
      ],
      7,
      NOW,
    );
    expect(t.total[6]).toBe(3);
    expect(t.booked[6]).toBe(2);
  });
});

describe("dayLabels", () => {
  it("labels every bucket, oldest first, ending today (UTC)", () => {
    const labels = dayLabels(7, NOW);
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe("Aug 7");
    expect(labels[6]).toBe("Aug 13");
  });
});

describe("outcomeCounts", () => {
  it("counts every outcome and folds null into no_action", () => {
    const counts = outcomeCounts([
      row("2026-08-13T00:00:00Z", "booked"),
      row("2026-08-13T00:00:00Z", "booked"),
      row("2026-08-13T00:00:00Z", "unclear"),
      row("2026-08-13T00:00:00Z", "emergency_escalated"),
      row("2026-08-13T00:00:00Z", "voicemail_left"),
      row("2026-08-13T00:00:00Z", null),
      row("2026-08-13T00:00:00Z", "no_action"),
    ]);
    expect(counts).toEqual({
      booked: 2,
      no_action: 2,
      unclear: 1,
      emergency_escalated: 1,
      voicemail_left: 1,
    });
  });

  it("always sums to the row count", () => {
    const rows = [
      row("2026-08-13T00:00:00Z", null),
      row("2026-08-13T00:00:00Z", "booked"),
    ];
    const total = Object.values(outcomeCounts(rows)).reduce((a, b) => a + b, 0);
    expect(total).toBe(rows.length);
  });
});

describe("channelCounts", () => {
  it("splits chat vs voice", () => {
    const counts = channelCounts([
      row("2026-08-13T00:00:00Z", null, "chat"),
      row("2026-08-13T00:00:00Z", null, "voice"),
      row("2026-08-13T00:00:00Z", null, "voice"),
    ]);
    expect(counts).toEqual({ chat: 1, voice: 2 });
  });
});

describe("hourlyHeatmap", () => {
  it("returns a 7×24 grid of zeros for no rows", () => {
    const grid = hourlyHeatmap([], "UTC");
    expect(grid).toHaveLength(7);
    for (const dayRow of grid) {
      expect(dayRow).toHaveLength(24);
      expect(dayRow.every((c) => c === 0)).toBe(true);
    }
  });

  it("places rows at [weekday][hour], Monday-first", () => {
    // 2026-08-13 is a Thursday (index 3); 2026-08-16 a Sunday (index 6).
    const grid = hourlyHeatmap(
      [
        row("2026-08-13T14:15:00Z"),
        row("2026-08-13T14:45:00Z"),
        row("2026-08-16T00:05:00Z"),
      ],
      "UTC",
    );
    expect(grid[3][14]).toBe(2);
    expect(grid[6][0]).toBe(1);
  });

  it("respects the given timezone", () => {
    // 23:30 UTC on Thursday is 18:30 Thursday in Chicago (UTC-5 in August).
    const grid = hourlyHeatmap([row("2026-08-13T23:30:00Z")], "America/Chicago");
    expect(grid[3][18]).toBe(1);
  });

  it("skips unparsable timestamps", () => {
    const grid = hourlyHeatmap([row("nope")], "UTC");
    expect(grid.flat().every((c) => c === 0)).toBe(true);
  });
});

describe("heatmapPeak", () => {
  it("is null for an all-zero grid so callers can skip the peak callout", () => {
    expect(heatmapPeak(hourlyHeatmap([], "UTC"))).toBeNull();
  });

  it("finds the busiest cell", () => {
    const grid = hourlyHeatmap(
      [
        row("2026-08-13T14:00:00Z"),
        row("2026-08-13T14:30:00Z"),
        row("2026-08-11T09:00:00Z"),
      ],
      "UTC",
    );
    expect(heatmapPeak(grid)).toEqual({ day: 3, hour: 14, count: 2 });
  });
});

describe("conversionRate", () => {
  it("is a whole percent of booked over total", () => {
    expect(conversionRate(1, 3)).toBe(33);
    expect(conversionRate(2, 2)).toBe(100);
    expect(conversionRate(0, 5)).toBe(0);
  });

  it("is null with no conversations, never a fake 0%", () => {
    expect(conversionRate(0, 0)).toBeNull();
  });
});
