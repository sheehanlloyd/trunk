import type { Metadata } from "next";
import Link from "next/link";

import { NotificationPreferencesForm } from "@/components/dashboard/NotificationPreferencesForm";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { Button } from "@/components/shared/Button";
import { PageLayout } from "@/components/shared/PageLayout";
import { requireAuth } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Knowledge & Settings — AI Receptionist",
};

export default async function SettingsPage() {
  const context = await requireAuth();
  if (!context) return null;
  const { business } = context;

  return (
    <PageLayout
      title="Knowledge & Settings"
      description="Everything here is what your AI tells customers. Edit it anytime — changes take effect right away."
      actions={
        <Button asChild variant="secondary">
          <Link href="/dashboard/knowledge">Review AI corrections</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <SettingsForm business={business} />
        <NotificationPreferencesForm prefs={business.notification_preferences} />
      </div>
    </PageLayout>
  );
}
