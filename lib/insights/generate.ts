import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { daysAgoISO } from "@/lib/dashboard/format";
import type { ConversationTurn, InsightContent } from "@/lib/types/database";

/**
 * AI insights generation (design: analytics page, bottom section). One call
 * reads the tenant's recent conversations and produces a structured report —
 * top questions, knowledge gaps, ready-to-apply corrections — stored as an
 * `insights` row. The aggregate stats are computed here in code, never by the
 * model, so the numbers on the report always match the database.
 *
 * The prompt/schema helpers are pure and exported for unit tests; everything
 * with I/O (auth, Supabase, Anthropic) is imported lazily inside
 * generateInsights, mirroring engine.ts, so this module stays importable in
 * vitest without env vars.
 */

export const INSIGHT_PERIOD_DAYS = 30;
/** Below this there's nothing worth paying a model to summarize. */
export const MIN_CONVERSATIONS = 5;
/** Cap on conversations sent to the model — most recent first. */
export const MAX_CONVERSATIONS = 100;
/** Long chats are truncated to their most recent turns to bound the prompt. */
export const MAX_TRANSCRIPT_TURNS = 20;

export type GenerateInsightsResult = { ok: boolean; error?: string };

/**
 * How fresh a report has to be for the weekly sweep to leave it alone. Six,
 * not seven: a weekly cron never fires exactly 168h apart (schedulers drift,
 * runs queue), and a 7-day threshold would make every other week silently skip
 * the tenant it was meant to serve.
 */
export const MIN_REGENERATE_DAYS = 6;

/**
 * Whether the weekly sweep should generate a new report for a business, given
 * the timestamp of its newest existing one (null = never generated).
 *
 * Pure so the schedule logic is testable without a database or a model call.
 */
export function shouldRegenerate(
  latestCreatedAt: string | null,
  now: number = Date.now(),
  minDays: number = MIN_REGENERATE_DAYS,
): boolean {
  if (!latestCreatedAt) return true;
  const generatedAt = Date.parse(latestCreatedAt);
  // An unparseable timestamp shouldn't wedge a tenant out of reports forever.
  if (Number.isNaN(generatedAt)) return true;
  return now - generatedAt >= minDays * 24 * 60 * 60 * 1000;
}

/** The slice of a conversation row the prompt is built from. */
export interface InsightSourceConversation {
  channel: string;
  outcome: string | null;
  created_at: string;
  transcript: ConversationTurn[];
}

/**
 * Mirrors InsightContent (lib/types/database.ts) minus `stats` — those are
 * deterministic counts we compute from the database, so asking the model to
 * emit them would only invite made-up numbers.
 */
export const InsightModelSchema = z.object({
  headline: z
    .string()
    .describe("One plain-English sentence: the single takeaway an owner should read first."),
  top_questions: z
    .array(
      z.object({
        question: z.string().describe("The question, phrased the way customers ask it."),
        count: z
          .number()
          .describe("How many of the provided conversations asked this. Count, don't estimate."),
      }),
    )
    .describe("Most common customer questions, most frequent first. At most 5."),
  gaps: z
    .array(z.string())
    .describe(
      "Places the AI lacked information, guessed, or had to punt to the owner. Empty if none.",
    ),
  suggested_corrections: z
    .array(
      z.object({
        original: z.string().describe("What the AI actually said (quote or close paraphrase)."),
        corrected: z
          .string()
          .describe("What it should say instead — concrete and ready for the owner to approve."),
      }),
    )
    .describe("Ready-to-apply knowledge corrections. Only ones clearly supported by a transcript."),
});

/** "Customer:/AI:" lines from the last `maxTurns` turns of a transcript. */
export function transcriptExcerpt(
  transcript: ConversationTurn[],
  maxTurns: number = MAX_TRANSCRIPT_TURNS,
): string {
  return transcript
    .slice(-maxTurns)
    .map((turn) => `${turn.role === "assistant" ? "AI" : "Customer"}: ${turn.text}`)
    .join("\n");
}

/** The user-message body: one numbered block per conversation, capped. */
export function buildInsightsPrompt(
  conversations: InsightSourceConversation[],
): string {
  const blocks = conversations
    .slice(0, MAX_CONVERSATIONS)
    .map((c, i) => {
      const header = `--- Conversation ${i + 1} (${c.channel}, outcome: ${
        c.outcome ?? "none"
      }, ${c.created_at.slice(0, 10)}) ---`;
      return `${header}\n${transcriptExcerpt(c.transcript)}`;
    });
  return [
    `Here are ${blocks.length} recent customer conversations handled by the AI receptionist:`,
    ...blocks,
  ].join("\n\n");
}

const SYSTEM_PROMPT = `You analyze customer conversations handled by an AI receptionist for a home-services business (HVAC/plumbing). Your report is read by the business owner — a busy tradesperson, not a data analyst.

From the transcripts provided:
- Find the questions customers most often asked. Group phrasings that mean the same thing, and count how many conversations asked each (count actual occurrences, never estimate).
- Identify knowledge gaps: moments the AI lacked information, hedged, guessed, or had to defer to the owner.
- For gaps with a clear fix, write a suggested correction: what the AI said, and exactly what it should say instead. Only suggest corrections a transcript actually supports — never invent prices, hours, or policies.
- Write a one-sentence headline with the single most useful takeaway.

Be specific and plain-spoken. Empty lists are fine if the conversations are unremarkable.`;

/**
 * Generates and stores one insights report for the signed-in owner's business.
 * Auth is re-checked here (reachable via direct POST); reads run under the
 * caller's RLS session, and the final insert uses the admin client because the
 * insights table is deliberately read-only for tenants (see 0011 migration) —
 * scoped by business_id like every service-role write.
 */
export async function generateInsights(): Promise<GenerateInsightsResult> {
  const { getCurrentBusiness } = await import("@/lib/auth/session");
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  return generateInsightsForBusiness(context.business.id, supabase);
}

/**
 * The generation core, callable for any business.
 *
 * Two callers with different trust models share it: the owner-facing action
 * above (auth-checked, reads through the caller's RLS session) and the weekly
 * cron (CRON_SECRET-guarded, reads with the service role because there is no
 * user session). Every read filters `business_id` explicitly, which is
 * redundant under RLS and load-bearing for the service role — so the same code
 * is correct in both directions.
 */
export async function generateInsightsForBusiness(
  businessId: string,
  supabase: SupabaseClient,
): Promise<GenerateInsightsResult> {
  const periodStart = daysAgoISO(INSIGHT_PERIOD_DAYS);
  const periodEnd = new Date().toISOString();

  // Stats are exact head-counts so the report's numbers don't depend on the
  // 100-conversation prompt cap.
  const [convRes, bookingsRes, leadsRes, emergenciesRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("channel, outcome, created_at, transcript", { count: "exact" })
      .eq("business_id", businessId)
      .gte("created_at", periodStart)
      .order("created_at", { ascending: false })
      .limit(MAX_CONVERSATIONS)
      .returns<InsightSourceConversation[]>(),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", periodStart),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", periodStart),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", periodStart)
      .eq("outcome", "emergency_escalated"),
  ]);

  if (convRes.error) return { ok: false, error: convRes.error.message };
  const conversations = convRes.data ?? [];
  const conversationCount = convRes.count ?? conversations.length;

  if (conversationCount < MIN_CONVERSATIONS) {
    return {
      ok: false,
      error:
        "Not enough conversation history yet — insights need at least " +
        `${MIN_CONVERSATIONS} conversations in the last ${INSIGHT_PERIOD_DAYS} days.`,
    };
  }

  const stats: InsightContent["stats"] = {
    conversations: conversationCount,
    bookings: bookingsRes.count ?? 0,
    leads: leadsRes.count ?? 0,
    emergencies: emergenciesRes.count ?? 0,
  };

  const { CLAUDE_MODEL, getAnthropic } = await import("@/lib/ai/anthropic");
  const anthropic = getAnthropic();
  let parsed: z.infer<typeof InsightModelSchema> | null;
  try {
    // Reading ~100 transcripts is a long job: override the client's 20s
    // default with a per-request timeout, and give thinking room to work.
    const response = await anthropic.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        thinking: { type: "adaptive" },
        output_config: {
          format: zodOutputFormat(InsightModelSchema),
          effort: "medium",
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildInsightsPrompt(conversations) }],
      },
      { timeout: 120_000 },
    );
    parsed = response.parsed_output;
  } catch {
    return {
      ok: false,
      error: "Couldn't analyze your conversations right now. Please try again.",
    };
  }
  if (!parsed) {
    return {
      ok: false,
      error: "The analysis returned no report. Please try again.",
    };
  }

  const content: InsightContent = { ...parsed, stats };

  // Tenants have no INSERT policy on insights (by design) — write with the
  // service role, explicitly scoped to the verified business.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { error } = await createAdminClient().from("insights").insert({
    business_id: businessId,
    period_start: periodStart,
    period_end: periodEnd,
    content,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
