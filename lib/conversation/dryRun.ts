import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import type {
  Business,
  ConversationTurn,
  KnowledgeCorrection,
} from "@/lib/types/database";

import { buildConversationSystemPrompt } from "./prompt";
import { type TurnAnalysis, TurnAnalysisSchema } from "./types";

/**
 * A single sandboxed conversation turn for the dashboard's "Test your AI"
 * console. Composes the prompt and calls the model EXACTLY like the chat path
 * of `handleTurn` (engine.ts) — same model, thinking config, structured-output
 * schema — but performs ZERO database writes: no conversation, no booking, no
 * lead, no notification. The caller supplies the business, corrections, and
 * history it already holds, so what the owner sees is what a customer would
 * get, without any side effects.
 */

/** Mirrors engine.ts's history cap spirit at test-console scale. */
const MAX_DRY_RUN_TURNS = 12;

/** Maps transcript turns to Anthropic message params (same as engine.ts). */
function toMessages(transcript: ConversationTurn[]) {
  return transcript.slice(-MAX_DRY_RUN_TURNS).map((turn) => ({
    role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: turn.text,
  }));
}

export async function dryRunTurn(
  business: Business,
  corrections: KnowledgeCorrection[],
  history: ConversationTurn[],
  message: string,
): Promise<{ reply: string; analysis: TurnAnalysis }> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Message is required.");

  const withUser: ConversationTurn[] = [
    ...history,
    { role: "customer", text: trimmed },
  ];

  // Imported lazily to match engine.ts: keeps this module importable in unit
  // tests without eager env validation.
  const { CLAUDE_MODEL, getAnthropic } = await import("@/lib/ai/anthropic");
  const anthropic = getAnthropic();
  // Chat-path config from engine.ts: Claude 5 thinks by default and thinking
  // counts against max_tokens, so keep adaptive thinking with low effort and a
  // budget sized to fit thinking + reply.
  const response = await anthropic.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      format: zodOutputFormat(TurnAnalysisSchema),
      effort: "low",
    },
    system: buildConversationSystemPrompt(business, "chat", corrections),
    messages: toMessages(withUser),
  });

  const analysis = response.parsed_output;
  if (!analysis) {
    throw new Error("Conversation model returned no structured output.");
  }

  return { reply: analysis.reply, analysis };
}
