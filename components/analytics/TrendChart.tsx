/**
 * Daily conversations + bookings trend — zero-dependency inline SVG, server-
 * rendered (same approach as Sparkline.tsx: fixed viewBox, design tokens,
 * flat/empty series render a clean baseline instead of NaN paths).
 *
 * Encoding: conversations are context bars in a light brand wash; bookings —
 * the money series — ride on top as a 2px revenue line. Bookings are a subset
 * of conversations, so both share one axis; the two series also differ by mark
 * shape (bar vs line), so identity never rests on color alone. Native SVG
 * <title> tooltips cover every day; y-ticks carry the values not directly
 * labeled.
 */

const W = 720;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 26, left: 36 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

/** Smallest "clean" tick step (1/2/5 × 10^k) covering `raw`. */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

/** Bar with a 4px-rounded data end and a square baseline (never a full rrect). */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return [
    `M${(x).toFixed(1)},${(y + h).toFixed(1)}`,
    `V${(y + r).toFixed(1)}`,
    `Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}`,
    `H${(x + w - r).toFixed(1)}`,
    `Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}`,
    `V${(y + h).toFixed(1)}`,
    "Z",
  ].join(" ");
}

interface TrendChartProps {
  /** Conversations per day, oldest → newest. */
  total: number[];
  /** Booked subset per day, same length. */
  booked: number[];
  /** Per-day labels ("Aug 7") for the axis and tooltips, same length. */
  labels: string[];
}

export function TrendChart({ total, booked, labels }: TrendChartProps) {
  const n = Math.max(total.length, 1);
  const max = Math.max(1, ...total, ...booked);
  const step = niceStep(max / 4);
  const yMax = step * 4;

  const slot = INNER_W / n;
  const barW = Math.max(1, Math.min(20, slot - 2));
  const y = (v: number) => PAD.top + INNER_H * (1 - v / yMax);
  const centerX = (i: number) => PAD.left + i * slot + slot / 2;

  const linePoints = booked
    .map((v, i) => `${centerX(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const lastX = centerX(n - 1);
  const lastY = y(booked[n - 1] ?? 0);

  // Label roughly weekly for a month, sparser for a quarter.
  const labelEvery = n <= 7 ? 1 : n <= 31 ? 7 : 15;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: "var(--color-brand-200)" }}
          />
          Conversations
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-0.5 w-3.5 rounded-full"
            style={{ backgroundColor: "var(--color-revenue-600)" }}
          />
          Bookings
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Daily conversations and bookings for the last ${n} days`}
        className="block"
      >
        {/* Gridlines + y ticks: recessive hairlines, clean numbers. */}
        {[0, 1, 2, 3, 4].map((k) => {
          const v = k * step;
          const gy = y(v);
          return (
            <g key={k}>
              <line
                x1={PAD.left}
                y1={gy}
                x2={W - PAD.right}
                y2={gy}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={gy}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                {v.toLocaleString("en-US")}
              </text>
            </g>
          );
        })}

        {/* Conversation bars — a light wash so the revenue line stays the star. */}
        {total.map((v, i) =>
          v > 0 ? (
            <path
              key={i}
              d={barPath(
                PAD.left + i * slot + (slot - barW) / 2,
                y(v),
                barW,
                PAD.top + INNER_H - y(v),
              )}
              fill="var(--color-brand-200)"
            />
          ) : null,
        )}

        {/* Bookings line + emphasized endpoint (surface ring keeps it legible). */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--color-revenue-600)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={lastX}
          cy={lastY}
          r={4}
          fill="var(--color-revenue-600)"
          stroke="var(--color-surface)"
          strokeWidth={2}
        />

        {/* X labels. */}
        {labels.map((label, i) =>
          i % labelEvery === 0 ? (
            <text
              key={i}
              x={centerX(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-muted)"
            >
              {label}
            </text>
          ) : null,
        )}

        {/* Full-height hover targets: native tooltips, one per day. */}
        {total.map((v, i) => (
          <rect
            key={i}
            x={PAD.left + i * slot}
            y={PAD.top}
            width={slot}
            height={INNER_H}
            fill="transparent"
          >
            <title>
              {`${labels[i] ?? ""}: ${v} conversation${v === 1 ? "" : "s"}, ${
                booked[i] ?? 0
              } booked`}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
