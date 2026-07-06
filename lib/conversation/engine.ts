import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  clearLead,
  createBooking,
  isBookingComplete,
  isUsablePhone,
  upsertLead,
} from "@/lib/booking/capture";
import type { BookingDetails } from "@/lib/booking/types";
import type {
  ConversationOutcome,
  ConversationTurn,
} from "@/lib/types/database";

import {
  getBusiness,
  getKnowledgeCorrections,
  loadOrCreateConversation,
  saveConversation,
} from "./persistence";
import { buildConversationSystemPrompt } from "./prompt";
import {
  type TurnAnalysis,
  TurnAnalysisSchema,
  type TurnInput,
  type TurnResult,
} from "./types";

/** Cap on turns replayed to the model — keeps latency/cost bounded on long chats. */
const MAX_HISTORY_TURNS = 40;

/**
 * The channel-agnostic conversation engine (design §9 + §12). `handleTurn` is
 * the single entry point both chat (Phase 3) and voice (Phase 6) call: it loads
 * the business context and stored transcript, runs one structured Claude turn,
 * applies deterministic gates before writing any booking, persists the
 * conversation with an accurate outcome, and returns a channel-neutral result.
 */

// --- Pure decision helpers (unit-tested without any I/O) ---------------------

/** Higher number = "stickier" outcome; a later turn never downgrades a better one. */
export function outcomeRank(outcome: ConversationOutcome | null): number {
  switch (outcome) {
    case "emergency_escalated":
      return 4;
    case "booked":
      return 3;
    case "unclear":
      return 2;
    case "no_action":
      return 1;
    default:
      return 0;
  }
}

/** Keeps whichever outcome ranks higher, so "thanks, bye" can't unbook a booking. */
export function mergeOutcome(
  prev: ConversationOutcome | null,
  next: ConversationOutcome | null,
): ConversationOutcome | null {
  return outcomeRank(next) >= outcomeRank(prev) ? next : prev;
}

/** Maps the model's booking block to the shared BookingDetails shape. */
export function analysisToDetails(analysis: TurnAnalysis): BookingDetails {
  return {
    name: analysis.booking.name?.trim() ?? "",
    phone: analysis.booking.phone?.trim() ?? "",
    service: analysis.booking.service?.trim() ?? "",
    preferredTime: analysis.booking.preferred_time?.trim() ?? "",
    notes: analysis.booking.notes?.trim() ?? "",
  };
}

/** There's something worth saving as a lead if we have a name or a real phone. */
export function hasSavableContact(details: BookingDetails): boolean {
  return details.name.length > 0 || isUsablePhone(details.phone);
}

export interface Decision {
  outcome: ConversationOutcome;
  createBooking: boolean;
  /** null => don't write a lead this turn. */
  leadReason: string | null;
  aiConfidenceFlag: boolean;
}

/**
 * Decides this turn's side effects purely from the model analysis. Crucially,
 * a booking is only created when the model says it's confirmed AND the details
 * actually validate — the model can't fabricate a booking without a real phone.
 */
export function decide(analysis: TurnAnalysis, details: BookingDetails): Decision {
  // Emergencies short-circuit everything else (design §12).
  if (analysis.emergency_detected) {
    return {
      outcome: "emergency_escalated",
      createBooking: false,
      leadReason: null,
      aiConfidenceFlag: analysis.low_confidence,
    };
  }

  const complete = isBookingComplete(details);
  const claimedButIncomplete = analysis.booking_confirmed && !complete;

  if (analysis.booking_confirmed && complete) {
    return {
      outcome: "booked",
      createBooking: true,
      leadReason: null,
      aiConfidenceFlag: analysis.low_confidence,
    };
  }

  // Not booked. Figure out the right lead reason (only if we have contact info).
  let outcome: ConversationOutcome;
  let leadReason: string | null;
  if (analysis.out_of_area) {
    outcome = "no_action";
    leadReason = "out_of_area";
  } else if (analysis.needs_clarification) {
    outcome = "unclear";
    leadReason = "needs_callback";
  } else {
    outcome = "no_action";
    // Only treat as an in-progress (abandonable) booking if they've started one.
    leadReason = hasSavableContact(details) ? "incomplete" : null;
  }

  if (!hasSavableContact(details)) leadReason = null;

  return {
    outcome,
    createBooking: false,
    leadReason,
    // Flag if the model claimed a booking it couldn't back up, or self-reported low confidence.
    aiConfidenceFlag: analysis.low_confidence || claimedButIncomplete,
  };
}

// --- Orchestration -----------------------------------------------------------

/** Maps stored transcript turns to Anthropic message params. */
function toMessages(transcript: ConversationTurn[]) {
  return transcript.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: turn.text,
  }));
}

export async function handleTurn(input: TurnInput): Promise<TurnResult> {
  const message = input.message?.trim();
  if (!message) throw new Error("Message is required.");

  const [business, conversation, corrections] = await Promise.all([
    getBusiness(input.businessId),
    loadOrCreateConversation({
      businessId: input.businessId,
      conversationId: input.conversationId,
      channel: input.channel,
    }),
    getKnowledgeCorrections(input.businessId),
  ]);

  // Append the customer's turn to the DB-sourced history (never client-sourced).
  const withUser: ConversationTurn[] = [
    ...conversation.transcript,
    { role: "customer", text: message },
  ];

  // Imported lazily so this module's pure helpers (decide, mergeOutcome, …)
  // stay importable in unit tests without eager env validation.
  const { CLAUDE_MODEL, getAnthropic } = await import("@/lib/ai/anthropic");
  const anthropic = getAnthropic();
  const response = await anthropic.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: buildConversationSystemPrompt(business, input.channel, corrections),
    messages: toMessages(withUser),
    output_config: { format: zodOutputFormat(TurnAnalysisSchema) },
  });

  const analysis = response.parsed_output;
  if (!analysis) {
    throw new Error("Conversation model returned no structured output.");
  }

  const details = analysisToDetails(analysis);
  const decision = decide(analysis, details);

  // Apply side effects. Booking creation must succeed before we report "booked".
  let bookingId: string | null = null;
  if (decision.createBooking) {
    const created = await createBooking({
      businessId: input.businessId,
      conversationId: conversation.id,
      details,
    });
    bookingId = created.bookingId;
    await clearLead(conversation.id); // it converted from lead -> booking
  } else if (decision.leadReason) {
    await upsertLead({
      businessId: input.businessId,
      conversationId: conversation.id,
      partial: details,
      reason: decision.leadReason,
    });
  }

  const outcome = mergeOutcome(conversation.outcome, decision.outcome);

  const finalTranscript: ConversationTurn[] = [
    ...withUser,
    { role: "assistant", text: analysis.reply },
  ];

  // Sticky contact info: keep what we already knew if this turn didn't restate it.
  const customerName = details.name || conversation.customer_name || null;
  const customerPhone =
    (isUsablePhone(details.phone) ? details.phone : "") ||
    conversation.customer_phone ||
    null;

  await saveConversation(conversation.id, {
    transcript: finalTranscript,
    outcome,
    customerName,
    customerPhone,
    aiConfidenceFlag: conversation.ai_confidence_flag || decision.aiConfidenceFlag,
  });

  return {
    conversationId: conversation.id,
    reply: analysis.reply,
    outcome,
    bookingId,
    emergency: analysis.emergency_detected,
    aiConfidenceFlag: conversation.ai_confidence_flag || decision.aiConfidenceFlag,
  };
}
