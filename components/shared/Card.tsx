import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Base surface: white panel with border + considered elevation. Composable. */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-card",
        className,
      )}
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
        "flex items-center justify-between border-b border-border px-5 py-4",
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
      className={cn("font-display text-base font-semibold text-brand-800", className)}
      {...(props as HTMLAttributes<HTMLHeadingElement>)}
    >
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("px-5 py-4", className)} {...props}>
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
    <Card className="p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p
        className={cn(
          "font-display mt-2 text-3xl font-semibold",
          tone === "accent" ? "text-revenue-600" : "text-brand-800",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-sm text-muted">{hint}</p>
      ) : null}
    </Card>
  );
}
