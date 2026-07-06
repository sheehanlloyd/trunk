import { cn } from "@/lib/utils";

interface SparklineProps {
  /** The series to plot, oldest → newest. Values in any unit. */
  values: number[];
  /** Line/area color. Defaults to the revenue emerald. */
  color?: string;
  /** Fill the area under the line (subtle). */
  fill?: boolean;
  /** Emphasize the final point with a dot. */
  endpoint?: boolean;
  /** Draw-in animation: pass a unique id to key the CSS animation. Off by default. */
  animate?: boolean;
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Zero-dependency inline-SVG sparkline (area + line). Server-renderable — no
 * charting library — so it drops into server components and stays self-contained
 * (no CSP/CDN concerns). The viewBox is fixed and the SVG scales to its box, so
 * the same component works at hero size and inline-stat size.
 *
 * A flat series (all-equal, e.g. a brand-new account) renders a centered
 * baseline rather than a NaN path, so the zero-data state still looks intentional.
 */
export function Sparkline({
  values,
  color = "var(--color-revenue-600)",
  fill = true,
  endpoint = true,
  animate = false,
  className,
  width = 220,
  height = 56,
}: SparklineProps) {
  const w = width;
  const h = height;
  const pad = 4; // keep the endpoint dot + stroke inside the box

  const pts = values.length > 0 ? values : [0, 0];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;

  const coords = pts.map((v, i) => {
    const x = pts.length === 1 ? w / 2 : pad + (i / (pts.length - 1)) * (w - pad * 2);
    // Flat series → sit on the horizontal midline instead of the top edge.
    const t = max === min ? 0.5 : (v - min) / span;
    const y = h - pad - t * (h - pad * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h} L${coords[0][0].toFixed(1)},${h} Z`;
  const [ex, ey] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
      className={cn(animate && "spark-animate", className)}
    >
      {fill ? (
        <path d={area} fill={color} fillOpacity="0.10" stroke="none" />
      ) : null}
      <path
        className="spark-line"
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {endpoint ? (
        <circle className="spark-dot" cx={ex} cy={ey} r="3" fill={color} />
      ) : null}
    </svg>
  );
}
