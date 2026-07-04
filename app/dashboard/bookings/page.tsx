import type { Metadata } from "next";

import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";

export const metadata: Metadata = { title: "Bookings — AI Receptionist" };

export default function BookingsPage() {
  return (
    <PageLayout
      title="Bookings"
      description="Jobs captured by your AI, ready for you to confirm."
    >
      <Card className="p-8 text-center">
        <p className="text-sm text-[--color-muted]">
          Booking management and status controls arrive in a later phase.
        </p>
      </Card>
    </PageLayout>
  );
}
