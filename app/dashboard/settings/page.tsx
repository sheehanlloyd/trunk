import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
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
      description="Business info, services, hours, and what your AI knows."
      actions={
        <Button asChild variant="secondary">
          <Link href="/dashboard/knowledge">Review AI knowledge</Link>
        </Button>
      }
    >
      <Card className="p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Business name" value={business.name} />
          <Detail label="Owner email" value={business.owner_email} />
          <Detail
            label="Phone number"
            value={business.phone_number ?? "Not assigned yet"}
          />
          <Detail
            label="Service area"
            value={business.service_area ?? "Not set"}
          />
        </dl>
        <p className="mt-6 text-sm text-[--color-muted]">
          Editable settings (services, pricing, hours, emergency policy) arrive
          in a later phase.
        </p>
      </Card>
    </PageLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}
