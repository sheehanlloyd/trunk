/**
 * Horizontal 100%-stacked bar + legend, shared by the outcome breakdown and
 * the channel split. Server-rendered inline SVG in the Sparkline mold.
 *
 * Segment separation follows the dataviz spacer rule: a 2px surface gap
 * between fills, rounded outer ends only (via a clip on the whole bar), no
 * strokes. Identity never rests on color alone — every segment appears in the
 * legend with its label, count, and share, and carries a native <title>.
 *
 * Callers own the segment order: colors were validated for CVD-safe adjacency
 * in that order (see the analytics page), so don't re-sort by size.
 */

const W = 600;
const H = 28;
const GAP = 2;
const RADIUS = 6;

export interface BarSegment {
  key: string;
  label: string;
  count: number;
  /** CSS color — a design-token var() from the caller's validated set. */
  color: string;
}

interface SegmentBarProps {
  /** Unique per page instance — namespaces the SVG clipPath id. */
  id: string;
  segments: BarSegment[];
  /** Noun for tooltips, e.g. "conversations". */
  noun?: string;
}

export function SegmentBar({ id, segments, noun = "conversations" }: SegmentBarProps) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted">No data for this period.</p>;
  }

  const visible = segments.filter((s) => s.count > 0);
  const gapTotal = GAP * (visible.length - 1);
  const scale = (W - gapTotal) / total;
  const clipId = `segbar-${id}`;

  const widths = visible.map((s) => s.count * scale);
  const rects = visible.map((s, i) => ({
    ...s,
    width: widths[i],
    // Prefix sum of earlier widths + one gap per earlier segment.
    x: widths.slice(0, i).reduce((sum, w) => sum + w, 0) + i * GAP,
  }));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={segments
          .map((s) => `${s.label}: ${s.count}`)
          .join(", ")}
        className="block"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={W} height={H} rx={RADIUS} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {rects.map((s) => (
            <rect
              key={s.key}
              x={s.x.toFixed(1)}
              y={0}
              width={s.width.toFixed(1)}
              height={H}
              fill={s.color}
            >
              <title>{`${s.label}: ${s.count} ${noun} (${Math.round(
                (s.count / total) * 100,
              )}%)`}</title>
            </rect>
          ))}
        </g>
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-ink-700">{s.label}</span>
            <span className="font-display font-semibold text-brand-800">
              {s.count}
            </span>
            <span className="text-xs text-muted">
              {Math.round((s.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
