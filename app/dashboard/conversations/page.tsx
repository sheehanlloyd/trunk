import type { Metadata } from "next";

import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";

export const metadata: Metadata = { title: "Conversations — AI Receptionist" };

export default function ConversationsPage() {
  return (
    <PageLayout
      title="Conversations"
      description="Every chat and call your AI receptionist has handled."
    >
      <Card className="p-8 text-center">
        <p className="text-sm text-[--color-muted]">
          The conversation list and transcript viewer arrive in a later phase.
        </p>
      </Card>
    </PageLayout>
  );
}
