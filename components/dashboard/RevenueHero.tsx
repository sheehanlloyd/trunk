"use client";

import { useEffect, useState } from "react";

import { Sparkline } from "@/components/shared/Sparkline";

interface RevenueHeroProps {
  /** Captured revenue this week, in whole dollars (already computed). */
  amount: number;
  /** Daily captured-value series for the trend (oldest → newest), in dollars. */
  series: number[];
  /** Jobs captured this week (for the supporting line). */
  jobs: number;
  /** Percent change vs the prior week, or null when there's no basis yet. */
  deltaPct: number | null;
  /** True when the owner hasn't set an average job value — revenue is unknown. */
  needsAvgValue: boolean;
}

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * The dashboard's thesis panel: the money the AI captured, as a large numeral
 * over a 14-day trend. This is the "worth $199/mo" proof for the owner and the
 * "line going up" for anyone they demo it to.
 *
 * Motion is a flourish: the number counts up and the sparkline draws in on
 * mount. Both honor prefers-reduced-motion — the count-up bails in its effect
 * (the value already renders at its final amount, so SSR and reduced-motion show
 * the real number immediately), and the sparkline's draw-in is disabled via a
 * CSS media query. Every state update happens inside requestAnimationFrame, not
 * synchronously in the effect body.
 */
export function RevenueHero({
  amount,
  series,
  jobs,
  deltaPct,
  needsAvgValue,
}: RevenueHeroProps) {
  const [shown, setShown] = useState(amount);

  useEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce || amount === 0) return; // value already renders at `amount`

    let raf = 0;
    const start = performance.now();
    const duration = 800;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setShown(Math.round(amount * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount]);

  return (
    <section
      className="rise-in relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-hero sm:p-7"
      aria-label="Revenue captured this week"
    >
      {/* faint revenue wash, top-right — depth without a flashy gradient identity */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, var(--color-revenue-50), transparent)",
        }}
      />

      <div className="relative flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-revenue-700">
            Captured this week
          </p>
          {deltaPct != null ? (
            <span
              className={
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold " +
                (deltaPct >= 0
                  ? "bg-revenue-50 text-revenue-700"
                  : "bg-copper-50 text-copper-700")
              }
            >
              {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%
            </span>
          ) : null}
        </div>

        <p className="font-display text-5xl font-bold text-brand-800 sm:text-6xl">
          {needsAvgValue ? "$0" : dollars.format(shown)}
        </p>

        <p className="mt-0.5 text-sm text-muted">
          {needsAvgValue ? (
            <>
              {jobs} {jobs === 1 ? "job" : "jobs"} captured — add your average job
              value to see this in dollars.
            </>
          ) : (
            <>
              {jobs} {jobs === 1 ? "job" : "jobs"} booked over the last 14 days
            </>
          )}
        </p>
      </div>

      <div className="relative mt-5">
        <Sparkline
          values={series}
          animate
          width={520}
          height={64}
          className="w-full"
        />
      </div>
    </section>
  );
}
