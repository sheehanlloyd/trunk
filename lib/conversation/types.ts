import { z } from "zod";

import type { ConversationChannel, ConversationOutcome } from "@/lib/types/database";

/**
 * Types for the channel-agnostic conversation engine. Chat and voice both call
 * `handleTurn(TurnInput) -> TurnResult`; only the transport around it differs.
 */

export interface TurnInput {
  businessId: string;
  /** Omit/null to start a new conversation; pass it back to continue one. */
  conversationId?: string | null;
  message: string;
  channel: ConversationChannel;
}

export interface TurnResult {
  conversationId: string;
  /** Natural-language reply — chat renders it, voice sends it to TTS. */
  reply: string;
  outcome: ConversationOutcome | null;
  bookingId: string | null;
  /** True when emergency language was detected — Phase 6 fires a priority alert. */
  emergency: boolean;
  aiConfidenceFlag: boolean;
  /** Per-turn (not sticky): the request was still unclear after the AI's one
   *  clarifying question this turn. Voice uses this to drive the 2-attempt
   *  voicemail fallback without the sticky outcome/confidence flags poisoning it. */
  needsClarification: boolean;
}

/**
 * Structured result Claude returns for each turn — the reply plus its read of
 * the conversation state. One call yields both, so the reply always matches the
 * detected state. Uses enums/booleans and empty-string defaults (never null) to
 * stay structured-output friendly, mirroring `lib/onboarding/extract.ts`.
 */
export const TurnAnalysisSchema = z.object({
  reply: z
    .string()
    .describe(
      "What to say to the customer next. Warm, concise, professional. Never " +
        "invent facts not given in the business context.",
    ),
  intent: z
    .enum([
      "greeting",
      "question",
      "booking",
      "emergency",
      "out_of_area",
      "unclear",
      "other",
    ])
    .describe("Your best read of what the customer is trying to do this turn."),
  booking: z
    .object({
      name: z.string().describe("Customer's name, or empty string if not given."),
      phone: z.string().describe("Callback phone number, or empty string."),
      service: z
        .string()
        .describe("Service they want, or empty string if not yet clear."),
      preferred_time: z
        .string()
        .describe("Preferred day/time or urgency, or empty string."),
      notes: z
        .string()
        .describe("Any useful extra detail (address, symptom), or empty string."),
    })
    .describe(
      "Booking details gathered SO FAR across the whole conversation. Carry " +
        "forward everything already provided; use empty strings for what's missing.",
    ),
  booking_confirmed: z
    .boolean()
    .describe(
      "TRUE only after you have read ALL the details back to the customer AND " +
        "they explicitly confirmed they're correct. Otherwise FALSE.",
    ),
  emergency_detected: z
    .boolean()
    .describe(
      "TRUE if the customer describes an emergency per the business's emergency " +
        "policy (e.g. gas smell, flooding, no heat in freezing weather).",
    ),
  out_of_area: z
    .boolean()
    .describe("TRUE if the customer is outside the business's stated service area."),
  needs_clarification: z
    .boolean()
    .describe(
      "TRUE if the request is still unclear after you've asked your one " +
        "clarifying question this turn.",
    ),
  low_confidence: z
    .boolean()
    .describe(
      "TRUE if the customer was vague, contradictory, or cut off, so an owner " +
        "should double-check anything captured.",
    ),
});

export type TurnAnalysis = z.infer<typeof TurnAnalysisSchema>;
