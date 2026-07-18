"use server";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentBusiness } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/database";

/**
 * Server Actions for the conversations pages. Follows the dashboard action
 * conventions: re-check auth inside (reachable by direct POST), mutate through
 * the cookie-scoped RLS client, return {ok, error}, revalidate affected paths.
 */

export type ActionResult = { ok: boolean; error?: string };

const SummarySchema = z.object({ summary: z.string() });

const SUMMARY_SYSTEM_PROMPT =
  "You summarize AI-receptionist conversations for a busy trades business owner " +
  "(HVAC, plumbing, electrical). Write a 2-3 sentence plain-English summary covering: " +
  "what the customer wanted, what happened in the conversation, and any follow-up the " +
  "owner needs to take. No preamble, no headings — just the summary sentences.";

/** Renders a stored transcript as plain "Customer:/Receptionist:" lines. */
function renderTranscript(transcript: Conversation["transcript"]): string {
  return transcript
    .map(
      (turn) =>
        `${turn.role === "customer" ? "Customer" : "Receptionist"}: ${turn.text}`,
    )
    .join("\n");
}

/**
 * Generates (or regenerates) the AI summary for one conversation and stores it
 * on the row. Called from the detail page's SummaryCard via useActionState.
 */
export async function summarizeConversation(
  conversationId: string,
): Promise<ActionResult> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  // RLS scopes this to the caller's business; the explicit business_id filter
  // is defense in depth, matching the dashboard action conventions.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, transcript")
    .eq("id", conversationId)
    .eq("business_id", context.business.id)
    .maybeSingle<Pick<Conversation, "id" | "transcript">>();

  if (!conversation) return { ok: false, error: "Conversation not found." };

  const transcript = Array.isArray(conversation.transcript)
    ? conversation.transcript
    : [];
  if (transcript.length < 2) {
    return { ok: false, error: "Not enough conversation to summarize." };
  }

  // Imported lazily, matching engine.ts, so this module stays importable
  // without eager env validation.
  const { CLAUDE_MODEL, getAnthropic } = await import("@/lib/ai/anthropic");
  const anthropic = getAnthropic();

  let summary: string;
  try {
    const response = await anthropic.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        output_config: {
          format: zodOutputFormat(SummarySchema),
          effort: "low",
        },
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: renderTranscript(transcript) }],
      },
      { timeout: 60_000 },
    );
    summary = response.parsed_output?.summary.trim() ?? "";
  } catch {
    return {
      ok: false,
      error: "Couldn't generate a summary right now. Please try again.",
    };
  }

  if (!summary) {
    return {
      ok: false,
      error: "The AI didn't return a summary. Please try again.",
    };
  }

  const { error } = await supabase
    .from("conversations")
    .update({ summary })
    .eq("id", conversationId)
    .eq("business_id", context.business.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/conversations");
  revalidatePath(`/dashboard/conversations/${conversationId}`);
  return { ok: true };
}
