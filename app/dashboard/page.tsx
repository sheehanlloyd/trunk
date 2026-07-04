import type { Metadata } from "next";

import { PageLayout } from "@/components/shared/PageLayout";
import { StatCard } from "@/components/shared/Card";
import { Card } from "@/components/shared/Card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard — AI Receptionist" };

export default async function DashboardOverviewPage() {
  const context = await requireAuth();
  // Layout already handles the null case; guard for type-narrowing.
  if (!context) return null;

  const { business } = context;
  const supabase = await createClient();

  // All queries below are automatically scoped to this tenant by RLS.
  const [conversations, newBookings, voicemails] = await Promise.all([
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "new"),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("outcome", "voicemail_left"),
  ]);

  return (
    <PageLayout
      title="Dashboard"
      description="Your AI receptionist activity at a glance."
      actions={<StatusBadge status={business.status} />}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Conversations today"
          value={conversations.count ?? 0}
          hint="Chats & calls handled"
        />
        <StatCard
          label="Bookings today"
          value={newBookings.count ?? 0}
          hint="New jobs awaiting review"
        />
        <StatCard
          label="Missed calls"
          value={voicemails.count ?? 0}
          hint="Voicemails to follow up"
        />
        <StatCard
          label="Revenue potential captured"
          value="$—"
          hint="Wired up in a later phase"
          tone="accent"
        />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Welcome to {business.name}
        </h2>
        <p className="mt-2 text-sm text-[--color-muted]">
          This is the foundation of your dashboard. Conversations, bookings, and
          AI knowledge tools arrive in the next phases — everything you see here
          is already scoped to your business and no one else&apos;s.
        </p>
      </Card>
    </PageLayout>
  );
}
