"use server";

import { getCurrentBusiness } from "@/lib/auth/session";
import { dryRunTurn } from "@/lib/conversation/dryRun";
import { analysisToDetails, decide } from "@/lib/conversation/engine";
import type { TurnAnalysis } from "@/lib/conversation/types";
import { rateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import type {
  ConversationTurn,
  KnowledgeCorrection,
} from "@/lib/types/database";

/**
 * Server Action for the Knowledge page's "Test your AI" console. Same trust
 * model as the other dashboard actions: it re-checks auth itself (reachable by
 * direct POST) and reads corrections through the cookie-scoped Supabase client
 * so RLS enforces tenant isolation. The turn itself is a dry run — nothing is
 * saved, no conversation exists, no notifications fire.
 */

export interface TestAnswer {
  ok: boolean;
  error?: string;
  reply?: string;
  /** Owner-readable signals of what this turn WOULD have done for real. */
  flags?: string[];
}

/** Cap on replayed test turns — keeps latency/cost bounded (engine caps at 40
 *  for real chats; a sandbox doesn't need anywhere near that). */
const MAX_TEST_HISTORY_TURNS = 12;

/** Matches /api/chat's per-message cap. */
const MAX_MESSAGE_LENGTH = 4000;

/**
 * The client keeps the thread in React state, so history arrives from the
 * browser — sanitize it to plain role/text turns before it touches the prompt.
 */
function sanitizeHistory(history: unknown): ConversationTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (turn): turn is ConversationTurn =>
        turn != null &&
        typeof turn === "object" &&
        ((turn as ConversationTurn).role === "customer" ||
          (turn as ConversationTurn).role === "assistant") &&
        typeof (turn as ConversationTurn).text === "string",
    )
    .map((turn) => ({
      role: turn.role,
      text: turn.text.slice(0, MAX_MESSAGE_LENGTH),
    }))
    .slice(-MAX_TEST_HISTORY_TURNS);
}

/**
 * Translates the model's analysis into owner-readable "what would happen"
 * chips, mirroring the decision logic real turns run through (`decide` in
 * engine.ts) so the sandbox never promises a side effect the engine wouldn't
 * actually perform — e.g. "booking confirmed" without a usable phone number
 * does NOT create a booking, so it isn't flagged as one here either.
 */
function deriveFlags(analysis: TurnAnalysis): string[] {
  const details = analysisToDetails(analysis);
  const decision = decide(analysis, details);
  const flags: string[] = [];

  if (decision.outcome === "emergency_escalated") {
    flags.push("Would flag as emergency and alert you instantly");
  }
  if (decision.createBooking) {
    flags.push("Would create a booking");
  }
  if (decision.leadReason === "incomplete") {
    flags.push("Would save a lead (partial booking details)");
  } else if (decision.leadReason === "out_of_area") {
    flags.push("Would save an out-of-area lead");
  } else if (decision.leadReason === "needs_callback") {
    flags.push("Would save a lead for a callback");
  }
  if (analysis.needs_clarification) {
    flags.push("Low confidence — would ask for clarification");
  } else if (decision.aiConfidenceFlag) {
    flags.push("Low confidence — would flag for your review");
  }

  return flags;
}

export async function askTestQuestion(
  history: ConversationTurn[],
  message: string,
): Promise<TestAnswer> {
  const context = await getCurrentBusiness();
  if (!context) return { ok: false, error: "Not signed in." };

  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) return { ok: false, error: "Type a question first." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "That message is too long." };
  }

  // Each test turn is a real model call, so bound the spend any one tenant's
  // console can run up (mirrors /api/chat's per-business limit, but tighter —
  // it's one owner typing, not their customers).
  const limit = await rateLimit(`test-console:${context.business.id}`, 10, 60_000);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Slow down a touch — try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  // Corrections are read under RLS (the owner's own tenant), matching what the
  // real engine loads for a live turn, so the sandbox reflects saved fixes
  // immediately.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_corrections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<KnowledgeCorrection[]>();

  if (error) return { ok: false, error: error.message };

  try {
    const { reply, analysis } = await dryRunTurn(
      context.business,
      data ?? [],
      sanitizeHistory(history),
      trimmed,
    );
    return { ok: true, reply, flags: deriveFlags(analysis) };
  } catch (err) {
    console.error("[test-console] dry run failed", err);
    return { ok: false, error: "The AI didn't answer — try again in a moment." };
  }
}
