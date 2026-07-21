import type { Metadata } from "next";
import Link from "next/link";

import { InstallCard } from "@/components/dashboard/InstallCard";
import { NotificationPreferencesForm } from "@/components/dashboard/NotificationPreferencesForm";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { TeamCard } from "@/components/dashboard/TeamCard";
import { WidgetStudio } from "@/components/dashboard/WidgetStudio";
import { Button } from "@/components/shared/Button";
import { PageLayout } from "@/components/shared/PageLayout";
import { requireAuth } from "@/lib/auth/session";
import { buildEmbedCode } from "@/lib/onboarding/embed";

export const metadata: Metadata = {
  title: "Knowledge & Settings",
};

export default async function SettingsPage() {
  const context = await requireAuth();
  if (!context) return null;
  const { business, membership } = context;

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
        <InstallCard
          embedCode={buildEmbedCode(business.id)}
          phoneNumber={business.phone_number}
        />
        <WidgetStudio
          businessName={business.name}
          config={business.widget_config}
        />
        <SettingsForm business={business} />
        <NotificationPreferencesForm prefs={business.notification_preferences} />
        <TeamCard businessId={business.id} viewerRole={membership.role} />
      </div>
    </PageLayout>
  );
}
