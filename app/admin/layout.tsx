import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getOperator } from "@/lib/auth/operator";

/**
 * Operator-only admin shell (internal). Lives outside /dashboard because
 * operators aren't tenants — they have no linked business, so the dashboard's
 * business gate doesn't apply. Access is the same gate as /onboarding.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const operator = await getOperator();
  if (!operator) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-brand-700">
              Trunk
            </span>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
              Operator
            </span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/onboarding" className="text-ink-600 hover:text-ink-900">
              Onboarding
            </Link>
            <span className="text-muted">{operator.email}</span>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
