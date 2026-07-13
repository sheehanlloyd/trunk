import { heatmapPeak } from "@/lib/analytics/aggregate";

/**
 * Peak-hours heatmap: 7 days × 24 hours of conversation counts on a
 * sequential brand ramp (one hue, light → dark — magnitude, not identity).
 * Server-rendered inline SVG; the fixed viewBox rides in a horizontal-scroll
 * container so mobile keeps full hour resolution instead of squashed cells.
 *
 * Every cell has a native <title> tooltip, the single busiest cell gets a
 * copper ring (the app's attention accent) plus a plain-English caption, and
 * a fewer→more swatch legend anchors the scale.
 */

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_FULL = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

/** 0 = empty (neutral), then 4 brand steps with monotone lightness. */
const RAMP = [
  "var(--color-ink-50)",
  "var(--color-brand-100)",
  "var(--color-brand-300)",
  "var(--color-brand-500)",
  "var(--color-brand-700)",
];

const LABEL_W = 34;
const CELL = 21;
const GAP = 3;
const TOP = 18;
const W = LABEL_W + 24 * CELL + 23 * GAP;
const H = TOP + 7 * CELL + 6 * GAP;

/** Compact axis label: 12a, 3a … 12p, 9p. */
function axisHour(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/** Tooltip-friendly hour: "2 PM". */
function fullHour(h: number): string {
  const base = h % 12 === 0 ? 12 : h % 12;
  return `${base} ${h < 12 ? "AM" : "PM"}`;
}

/** "2–3 PM" (or "11 PM–12 AM" across the wrap). */
function hourRange(h: number): string {
  const next = (h + 1) % 24;
  const sameHalf = h < 12 === next < 12 && next !== 0;
  const start = sameHalf ? `${h % 12 === 0 ? 12 : h % 12}` : fullHour(h);
  return `${start}–${fullHour(next)}`;
}

interface HoursHeatmapProps {
  /** 7×24 counts, Monday-first — from hourlyHeatmap(). */
  grid: number[][];
}

export function HoursHeatmap({ grid }: HoursHeatmapProps) {
  const peak = heatmapPeak(grid);
  const max = peak?.count ?? 0;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Conversations by day of week and hour of day"
          className="block w-full min-w-[600px]"
        >
          {/* Hour labels every 3 hours. */}
          {Array.from({ length: 24 }, (_, h) =>
            h % 3 === 0 ? (
              <text
                key={h}
                x={LABEL_W + h * (CELL + GAP) + CELL / 2}
                y={11}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                {axisHour(h)}
              </text>
            ) : null,
          )}

          {grid.map((dayRow, d) => (
            <g key={d}>
              <text
                x={LABEL_W - 8}
                y={TOP + d * (CELL + GAP) + CELL / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                {DAYS_SHORT[d]}
              </text>
              {dayRow.map((count, h) => {
                // Quantize into the 4 filled ramp steps; 0 stays neutral.
                const bin =
                  count === 0 || max === 0
                    ? 0
                    : Math.max(1, Math.ceil((count / max) * 4));
                const isPeak = peak !== null && peak.day === d && peak.hour === h;
                return (
                  <rect
                    key={h}
                    x={LABEL_W + h * (CELL + GAP)}
                    y={TOP + d * (CELL + GAP)}
                    width={CELL}
                    height={CELL}
                    rx={4}
                    fill={RAMP[bin]}
                    stroke={isPeak ? "var(--color-copper-600)" : "none"}
                    strokeWidth={isPeak ? 2 : 0}
                  >
                    <title>{`${DAYS_SHORT[d]} ${hourRange(h)}: ${count} conversation${
                      count === 1 ? "" : "s"
                    }`}</title>
                  </rect>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-muted">
          {peak ? (
            <>
              Busiest:{" "}
              <span className="font-medium text-copper-700">
                {DAYS_FULL[peak.day]} {hourRange(peak.hour)}
              </span>
            </>
          ) : (
            "No activity to map yet."
          )}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted">
          <span className="mr-1">Fewer</span>
          {RAMP.map((color) => (
            <span
              key={color}
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: color }}
            />
          ))}
          <span className="ml-1">More</span>
        </div>
      </div>
    </div>
  );
}
