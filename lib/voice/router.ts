/**
 * Pure decision logic for what a voice call should do next (design §8). Kept
 * free of Twilio and the LLM so it's fully unit-testable — the endpoints just
 * translate its result into TwiML.
 */

/** Fall back to voicemail after this many failed turns (design §8, step 6). */
export const MAX_VOICE_ATTEMPTS = 2;

export type VoiceAction =
  | "emergency" // caller signaled an emergency — speak the policy reply, keep them on
  | "continue" // understood — speak the reply and gather again
  | "clarify" // still unclear but under the limit — speak the AI's clarifying question
  | "reprompt" // no speech heard but under the limit — ask them to repeat
  | "voicemail"; // no speech or still-unclear at the limit — take a message

export interface VoiceTurnState {
  /** Did speech-to-text return any words this turn? */
  hasSpeech: boolean;
  /** Count of failed turns SO FAR this call (before this one). */
  attempts: number;
  /** Emergency detected this turn (per-turn, from the model). */
  emergency: boolean;
  /** Request still unclear after the AI's one clarifying question (per-turn). */
  needsClarification: boolean;
}

/**
 * Emergencies always win. Otherwise: no speech → reprompt (or voicemail at the
 * limit); still-unclear → clarify (or voicemail at the limit); anything
 * understood → continue.
 */
export function decideVoiceNext(state: VoiceTurnState): VoiceAction {
  if (state.emergency) return "emergency";

  const atLimit = state.attempts + 1 >= MAX_VOICE_ATTEMPTS;

  if (!state.hasSpeech) {
    return atLimit ? "voicemail" : "reprompt";
  }
  if (state.needsClarification) {
    return atLimit ? "voicemail" : "clarify";
  }
  return "continue";
}

/** Next value of the failed-turn counter for a given action. */
export function nextAttempts(action: VoiceAction, attempts: number): number {
  // A failed turn (had to reprompt or re-clarify) increments; progress resets.
  if (action === "reprompt" || action === "clarify") return attempts + 1;
  return 0;
}
