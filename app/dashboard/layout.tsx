import type { ReactNode } from "react";

import { CommandPalette } from "@/components/CommandPalette";
import { NavBar } from "@/components/shared/NavBar";
import { Card } from "@/components/shared/Card";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireAuth } from "@/lib/auth/session";

/**
 * Authenticated dashboard shell. Server-side auth gate (redirects to /login
 * when signed out) independent of middleware. If the user is signed in but not
 * linked to any business, we render a safe "no business" state rather than
 * leaking into a tenant.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requireAuth();

  if (!context) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <Card className="max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-ink-900">
            No business associated
          </h1>
          <p className="mt-2 text-sm text-muted">
            Your account isn&apos;t linked to a business yet. Please contact your
            platform operator to be invited, then sign in again.
          </p>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </Card>
      </div>
    );
  }

  const { business, membership } = context;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <NavBar businessName={business.name} userEmail={membership.email} />
      {/* Flat canvas. The wash that used to sit here was removed in the
          editorial pass — space and hairlines carry the hierarchy now. */}
      <main className="min-w-0 flex-1">{children}</main>
      {/* ⌘K palette — global to the dashboard, renders nothing until opened. */}
      <CommandPalette />
    </div>
  );
}
