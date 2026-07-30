import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Base surface. One hairline border is the entire treatment — no shadow, no
 * tint, no gradient. If two cards need separating, that is what space is for.
 * The 8px radius (--radius-card) is the app's shape language and lives here
 * and nowhere else.
 */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-6 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: CardProps) {
  return (
    <h3
      className={cn(
        "font-display text-[15px] font-semibold text-ink-900",
        className,
      )}
      {...(props as HTMLAttributes<HTMLHeadingElement>)}
    >
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("px-6 py-5", className)} {...props}>
      {children}
    </div>
  );
}

interface StatCardProps {
  /** Short metric label, e.g. "Bookings today". */
  label: string;
  /** The primary value, e.g. "12" or "$1,200". */
  value: ReactNode;
  /** Optional supporting line, ideally tied to money. */
  hint?: ReactNode;
  /** Accent the value color (e.g. revenue in emerald). */
  tone?: "default" | "accent";
}

/**
 * Specialized composition of Card for the dashboard's top metric cards.
 * Every number should tie back to money where possible (per design doc).
 */
export function StatCard({ label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <Card className="p-5 transition-colors duration-200 hover:border-border-strong">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p
        className={cn(
          // 600 rather than 700/800: at 34px the number is already the loudest
          // thing on the card, and extra weight only makes it look shouty.
          "font-display mt-3 text-[34px] font-semibold leading-none",
          tone === "accent" ? "text-revenue-700" : "text-ink-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2.5 text-sm text-muted">{hint}</p> : null}
    </Card>
  );
}
