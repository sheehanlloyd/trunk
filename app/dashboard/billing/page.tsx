import type { Metadata } from "next";

import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Billing — AI Receptionist" };

export default async function BillingPage() {
  const context = await requireAuth();
  if (!context) return null;
  const { business } = context;

  return (
    <PageLayout
      title="Billing"
      description="Your subscription status and invoices."
    >
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Subscription status
            </p>
            <p className="mt-1 text-sm text-[--color-muted]">
              $500 setup + $199/mo
            </p>
          </div>
          <StatusBadge status={business.status} />
        </div>
        <p className="mt-6 text-sm text-[--color-muted]">
          Stripe checkout and invoice history arrive in a later phase.
        </p>
      </Card>
    </PageLayout>
  );
}
