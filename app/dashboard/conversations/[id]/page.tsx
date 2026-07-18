import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyTranscriptButton } from "@/components/dashboard/CopyTranscriptButton";
import { CorrectAnswerButton } from "@/components/dashboard/CorrectAnswerButton";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/database";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireAuth();
  if (!context) return null;

  const { id } = await params;
  const supabase = await createClient();
  // RLS scopes this to the caller's business; a wrong id simply returns nothing.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Conversation>();

  if (!conversation) notFound();

  const flagged =
    conversation.ai_confidence_flag || conversation.outcome === "unclear";
  const who =
    conversation.customer_name ??
    conversation.customer_phone ??
    "Unknown caller";

  // Plain-text transcript for the copy button, built server-side so the
  // client component stays a dumb "write this string" button.
  const transcriptText = [
    `${context.business.name} — conversation with ${who}`,
    formatDateTime(conversation.created_at),
    "",
    ...conversation.transcript.map(
      (turn) =>
        `${turn.role === "customer" ? "Customer" : "Receptionist"}: ${turn.text}`,
    ),
  ].join("\n");

  return (
    <PageLayout
      title={who}
      description={`${conversation.channel === "voice" ? "Phone call" : "Website chat"} · ${formatDateTime(conversation.created_at)}`}
      actions={
        <div className="flex items-center gap-2">
          {conversation.outcome ? (
            <StatusBadge status={conversation.outcome} />
          ) : null}
          {conversation.transcript.length > 0 ? (
            <CopyTranscriptButton transcript={transcriptText} />
          ) : null}
          <Link
            href="/dashboard/conversations"
            className="text-sm font-medium text-brand-700 underline underline-offset-2"
          >
            Back
          </Link>
        </div>
      }
    >
      {flagged ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">Worth a closer look.</strong> The AI
          wasn&apos;t fully confident here. Read it through, and if it got
          anything wrong, tap “Correct this answer” under that reply.
        </div>
      ) : null}

      <SummaryCard
        conversationId={conversation.id}
        summary={conversation.summary}
      />

      {conversation.customer_phone ? (
        <Card className="mb-4 flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Customer phone
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink-900">
              {conversation.customer_phone}
            </p>
          </div>
          <a
            href={`tel:${conversation.customer_phone}`}
            className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-medium leading-[44px] text-white hover:bg-brand-700"
          >
            Call back
          </a>
        </Card>
      ) : null}

      <Card className="p-4 sm:p-6">
        {conversation.transcript.length === 0 ? (
          <p className="text-sm text-muted">
            This conversation has no messages yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {conversation.transcript.map((turn, i) => {
              const isCustomer = turn.role === "customer";
              return (
                <li
                  key={i}
                  className={isCustomer ? "flex justify-start" : "flex justify-end"}
                >
                  <div
                    className={
                      "max-w-[85%] " + (isCustomer ? "" : "flex flex-col items-end")
                    }
                  >
                    <span className="mb-1 block text-xs font-medium text-muted">
                      {isCustomer ? "Customer" : "AI receptionist"}
                    </span>
                    <div
                      className={
                        "rounded-2xl px-4 py-2.5 text-sm " +
                        (isCustomer
                          ? "bg-ink-100 text-ink-900"
                          : "bg-brand-600 text-white")
                      }
                    >
                      {turn.text}
                    </div>
                    {!isCustomer ? (
                      <CorrectAnswerButton answer={turn.text} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageLayout>
  );
}
