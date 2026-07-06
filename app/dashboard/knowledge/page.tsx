import type { Metadata } from "next";

import { CorrectionForm } from "@/components/dashboard/CorrectionForm";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { requireAuth } from "@/lib/auth/session";
import { formatDate } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { KnowledgeCorrection } from "@/lib/types/database";

export const metadata: Metadata = { title: "AI Knowledge — AI Receptionist" };

export default async function KnowledgePage() {
  const context = await requireAuth();
  if (!context) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge_corrections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<KnowledgeCorrection[]>();

  const corrections = (data ?? []).filter((c) => c.corrected_content);

  return (
    <PageLayout
      title="AI Knowledge"
      description="Corrections you've given your AI. It uses these on every new conversation."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Add a correction</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-muted">
              Tell your AI what to say differently. The fastest way is the
              “Correct this answer” button inside any conversation — but you can
              add one here too.
            </p>
            <CorrectionForm submitLabel="Save correction" />
          </CardBody>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Your corrections
          </h2>
          {corrections.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted">
                No corrections yet. When your AI gets something wrong, correct it
                here or from a conversation and it&apos;ll learn immediately.
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {corrections.map((c) => (
                <li key={c.id}>
                  <Card className="p-4">
                    {c.original_content ? (
                      <p className="text-sm text-slate-500 line-through">
                        {c.original_content}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {c.corrected_content}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Added {formatDate(c.created_at)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
