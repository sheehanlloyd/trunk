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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-[--color-muted]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
