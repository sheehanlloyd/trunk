import type { ReactNode } from "react";

interface PageLayoutProps {
  title: string;
  description?: string;
  /** Optional right-aligned actions (e.g. a primary CTA button). */
  actions?: ReactNode;
  children: ReactNode;
}

/** Consistent page wrapper: title block + actions + content, max-width padded. */
export function PageLayout({
  title,
  description,
  actions,
  children,
}: PageLayoutProps) {
  return (
    // rise-in gives every dashboard page a consistent, subtle entrance
    // (disabled under prefers-reduced-motion). The generous vertical rhythm
    // here — not the cards — is what makes the app feel unhurried.
    <div className="rise-in mx-auto w-full max-w-6xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[25px] font-semibold text-ink-900 sm:text-[28px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
