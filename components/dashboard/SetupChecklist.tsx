import Link from "next/link";

import { Card } from "@/components/shared/Card";

export interface SetupItem {
  /** Short imperative label, e.g. "Add your average job value". */
  label: string;
  done: boolean;
  /** Where to complete the step; omit for passive milestones (e.g. first booking). */
  href?: string;
}

/** Progress ring geometry — small enough to sit inline with the card header. */
const RING_RADIUS = 15.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Onboarding checklist for the dashboard home. This is many owners' first
 * screen, so it earns its place only while there's setup left to do — once
 * every step is complete it renders nothing and the dashboard stays clean.
 * All completion state is computed server-side by the page; this component is
 * purely presentational.
 */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  const progress = doneCount / items.length;

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-brand-800">
            Get set up
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {doneCount} of {items.length} done — finish these to get the most
            from your receptionist.
          </p>
        </div>

        {/* Progress ring: brand track fills as steps complete. Decorative — the
            "N of M" line above carries the same info for screen readers. */}
        <div aria-hidden className="relative h-11 w-11 shrink-0">
          <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              stroke="var(--color-ink-100)"
              strokeWidth="4"
            />
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              stroke="var(--color-brand-600)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-[11px] font-semibold text-brand-800">
            {doneCount}/{items.length}
          </span>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.label}>
            {/* Incomplete steps with a destination are whole-row links;
                everything else is a static row. */}
            {!item.done && item.href ? (
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-ink-50"
              >
                <span className="flex items-center gap-3">
                  <StepMark done={false} />
                  <span className="text-sm font-medium text-ink-900">
                    {item.label}
                  </span>
                </span>
                <span aria-hidden className="text-ink-300">
                  ›
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3">
                <StepMark done={item.done} />
                <span
                  className={
                    item.done
                      ? "text-sm text-muted"
                      : "text-sm font-medium text-ink-900"
                  }
                >
                  {item.label}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Filled revenue check when done; empty ink circle while pending. */
function StepMark({ done }: { done: boolean }) {
  if (!done) {
    return (
      <span
        aria-hidden
        className="h-5 w-5 shrink-0 rounded-full border-2 border-ink-200"
      />
    );
  }
  return (
    <span
      aria-hidden
      // Ink, not green: a finished setup step is not money, and green here
      // would dilute the one signal that is.
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
        <path
          d="M2.5 6.5 5 9l4.5-5.5"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
