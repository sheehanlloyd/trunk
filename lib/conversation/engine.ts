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
  Business,
  Conversation,
  ConversationChannel,
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

/**
 * Channel-appropriate apology used when the model call itself fails (see
 * {@link runModelTurn}). Voice keeps this in "clarify" framing so the existing
 * 2-attempt voicemail fallback (`lib/voice/router.ts`) still applies unchanged;
 * chat gets a slightly longer, actionable apology since it renders directly as
 * a chat bubble rather than being spoken aloud.
 */
function fallbackReply(channel: ConversationChannel): string {
  return channel === "voice"
    ? "Sorry, I didn't quite catch that. Could you say that again?"
    : "Sorry — something went wrong on our end. Please try again, or leave your name and phone number and we'll follow up.";
}

/**
 * Calls Claude and returns its structured analysis, or `null` if the call
 * failed for any reason (timeout, rate limit, outage, empty structured
 * output). Never throws — callers decide what a failed turn means; this
 * function only isolates the one step that's allowed to fail.
 */
async function runModelTurn(
  business: Business,
  channel: ConversationChannel,
  corrections: Parameters<typeof buildConversationSystemPrompt>[2],
  history: ConversationTurn[],
): Promise<TurnAnalysis | null> {
  try {
    // Imported lazily so this module's pure helpers (decide, mergeOutcome, …)
    // stay importable in unit tests without eager env validation.
    const { CLAUDE_MODEL, VOICE_CLAUDE_MODEL, getAnthropic } = await import(
      "@/lib/ai/anthropic"
    );
    const anthropic = getAnthropic();
    // Voice is a live phone call — a caller is waiting in silence — so use the
    // faster model and a tighter token budget to cut per-turn latency. Chat
    // keeps the larger model. (Phase 6 latency tradeoff.)
    const isVoice = channel === "voice";
    const response = await anthropic.messages.parse({
      model: isVoice ? VOICE_CLAUDE_MODEL : CLAUDE_MODEL,
      max_tokens: isVoice ? 256 : 1024,
      system: buildConversationSystemPrompt(business, channel, corrections),
      messages: toMessages(history),
      output_config: { format: zodOutputFormat(TurnAnalysisSchema) },
    });
    return response.parsed_output ?? null;
  } catch (err) {
    console.error("[engine] model call failed", {
      businessId: business.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Safety net for when the model call fails AFTER the customer's turn is
 * already durably saved (see {@link handleTurn}). Never throws: always
 * returns a valid `TurnResult` so chat/voice callers can reply normally
 * instead of surfacing a raw error, and always leaves the conversation with
 * an accurate, non-null outcome. Whatever contact info earlier turns already
 * captured is preserved as a lead needing follow-up — this turn produced no
 * NEW extraction (the model never ran), but prior progress must not be lost
 * either (design §12: "save partial info... don't lose it").
 */
async function handleEngineFailure(
  business: Business,
  conversation: Conversation,
  withUser: ConversationTurn[],
  channel: ConversationChannel,
): Promise<TurnResult> {
  const reply = fallbackReply(channel);
  const outcome = mergeOutcome(conversation.outcome, "unclear");
  const finalTranscript: ConversationTurn[] = [
    ...withUser,
    { role: "assistant", text: reply },
  ];

  await saveConversation(conversation.id, {
    transcript: finalTranscript,
    outcome,
    customerName: conversation.customer_name,
    customerPhone: conversation.customer_phone,
    aiConfidenceFlag: true,
  });

  const knownDetails: BookingDetails = {
    name: conversation.customer_name ?? "",
    phone: conversation.customer_phone ?? "",
    service: "",
    preferredTime: "",
    notes: "",
  };
  if (hasSavableContact(knownDetails)) {
    try {
      await upsertLead({
        businessId: business.id,
        conversationId: conversation.id,
        partial: knownDetails,
        reason: "engine_error",
      });
    } catch (err) {
      console.error("[engine] failed to upsert lead after engine failure", err);
    }
  }

  return {
    conversationId: conversation.id,
    reply,
    outcome,
    bookingId: null,
    emergency: false,
    aiConfidenceFlag: true,
    needsClarification: true,
  };
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

  // Durability-first (design §12 / audit fix): persist the customer's turn to
  // the transcript IMMEDIATELY, before the model call below. If that call then
  // fails for any reason (timeout, rate limit, outage), what the customer said
  // is never silently lost — handleEngineFailure below always has it, and it's
  // already on disk even if the process crashes mid-request.
  await saveConversation(conversation.id, {
    transcript: withUser,
    outcome: conversation.outcome,
    customerName: conversation.customer_name,
    customerPhone: conversation.customer_phone,
    aiConfidenceFlag: conversation.ai_confidence_flag,
  });

  const analysis = await runModelTurn(business, input.channel, corrections, withUser);
  if (!analysis) {
    return handleEngineFailure(business, conversation, withUser, input.channel);
  }

  const details = analysisToDetails(analysis);
  const decision = decide(analysis, details);

  // Apply side effects. Booking creation must succeed before we report "booked".
  let bookingId: string | null = null;
  let bookingNewlyCreated = false;
  if (decision.createBooking) {
    const created = await createBooking({
      businessId: input.businessId,
      conversationId: conversation.id,
      details,
    });
    bookingId = created.bookingId;
    bookingNewlyCreated = created.created;
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

  // Instant owner notifications (design §12: instant for bookings and
  // emergencies; general activity goes to the daily digest). Fired on the
  // TRANSITION only — an emergency that was already escalated on a prior turn
  // won't re-alert — so this is idempotent across a multi-turn call. Shared by
  // chat and voice. Notifications are best-effort and never fail the turn.
  const emergencyEscalatedNow =
    decision.outcome === "emergency_escalated" &&
    conversation.outcome !== "emergency_escalated";
  const bookingJustCreated = bookingId && bookingNewlyCreated;
  if (emergencyEscalatedNow || bookingJustCreated) {
    try {
      const { notifyOwner } = await import("@/lib/notifications/send");
      if (emergencyEscalatedNow) {
        await notifyOwner({
          business,
          reason: "emergency",
          subject: `🚨 EMERGENCY call — ${business.name}`,
          body:
            `A caller just reported an emergency` +
            (customerPhone ? ` (callback: ${customerPhone})` : "") +
            `. Follow your emergency policy now: ` +
            `${business.emergency_policy?.trim() || "contact the caller immediately"}.`,
        });
      } else if (bookingJustCreated) {
        await notifyOwner({
          business,
          reason: "booking",
          subject: `New booking — ${details.name || "customer"}`,
          body:
            `New job booked by your AI receptionist: ` +
            `${details.service || "service TBD"}` +
            (details.preferredTime ? `, ${details.preferredTime}` : "") +
            `. Contact ${details.name || "the customer"}` +
            (customerPhone ? ` at ${customerPhone}` : "") +
            `. Open your dashboard to confirm.`,
        });
      }
    } catch (err) {
      console.error("[engine] owner notification failed", err);
    }
  }

  return {
    conversationId: conversation.id,
    reply: analysis.reply,
    outcome,
    bookingId,
    emergency: analysis.emergency_detected,
    aiConfidenceFlag: conversation.ai_confidence_flag || decision.aiConfidenceFlag,
    needsClarification: analysis.needs_clarification,
  };
}
