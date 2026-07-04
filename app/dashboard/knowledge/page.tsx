import type { Metadata } from "next";

import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";

export const metadata: Metadata = { title: "AI Knowledge — AI Receptionist" };

export default function KnowledgePage() {
  return (
    <PageLayout
      title="AI Knowledge"
      description="See what your AI knows and correct anything it gets wrong."
    >
      <Card className="p-8 text-center">
        <p className="text-sm text-[--color-muted]">
          Knowledge review and corrections arrive in a later phase.
        </p>
      </Card>
    </PageLayout>
  );
}
