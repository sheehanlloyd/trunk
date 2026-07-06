import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import type {
  Business,
  ConversationChannel,
  KnowledgeCorrection,
} from "@/lib/types/database";

/**
 * Renders owner-submitted knowledge corrections (design §12) as an authoritative
 * block that overrides the base business context. This is what makes the
 * dashboard "Correct this answer" flow actually change AI behavior: because the
 * prompt is rebuilt from the DB every turn, a just-submitted correction is in
 * force on the next customer message. Returns null when there's nothing to add.
 */
function formatCorrections(corrections: KnowledgeCorrection[]): string | null {
  const lines = corrections
    .filter((c) => c?.corrected_content && c.corrected_content.trim().length > 0)
    .map((c) => {
      const fix = c.corrected_content!.trim();
      const about = c.original_content?.trim();
      return about
        ? `- Regarding "${about}", the correct information is: ${fix}`
        : `- ${fix}`;
    });
  if (lines.length === 0) return null;

  return [
    "## Owner corrections (authoritative — override anything above)",
    "The business owner has reviewed past answers and provided these " +
      "corrections. They are more up to date than the context above; if any of " +
      "them conflict with it, follow the correction.",
    lines.join("\n"),
  ].join("\n");
}

/**
 * Builds the full system prompt for a live conversation turn. It reuses the
 * Phase 2 context engine (`buildSystemPrompt`) for the business-specific facts,
 * then layers on the booking-capture protocol and the design §12 edge-case
 * rules that apply to every tenant equally (no per-client branching), and
 * finally any owner corrections as authoritative overrides.
 *
 * `channel` only affects phrasing guidance — the rules are identical for chat
 * and voice, which is what lets Phase 6 reuse this untouched.
 */
export function buildConversationSystemPrompt(
  business: Business,
  channel: ConversationChannel,
  corrections: KnowledgeCorrection[] = [],
): string {
  const base = buildSystemPrompt(business);

  const bookingProtocol = [
    "## Booking",
    "When a customer wants to schedule work, collect these one at a time, " +
      "conversationally: their name, a callback phone number, the service they " +
      "need, and their preferred day/time (or urgency). Capture any useful extra " +
      "detail (address, description of the problem) as notes.",
    "Do not ask for everything at once. Acknowledge what they've told you and " +
      "ask for the next missing piece.",
    "Before finalizing, READ BACK all the details you collected and ask them to " +
      "confirm. Only treat the booking as confirmed once they explicitly say yes.",
  ].join("\n");

  const edgeCases = [
    "## Rules",
    "- Pricing: only ever give ranges the business context supports, phrased " +
      "like \"it depends on the details, but typically X–Y.\" Never invent an " +
      "exact price you were not given.",
    "- Out of service area: if the customer is outside the stated service area, " +
      "tell them honestly that they're outside the area rather than booking a job " +
      "the business can't do. Offer to take their details for a possible referral.",
    "- Unclear requests: if you don't understand what they need, ask exactly ONE " +
      "clarifying question. If it's still unclear after that, don't guess — offer " +
      "to take their name and number so someone can call them back.",
    "- Emergencies: if they describe an emergency, follow the business's " +
      "emergency policy above instead of the normal booking flow. Do not downplay it.",
    "- Never invent services, availability, guarantees, or any detail not in the " +
      "business context. If you don't know, say so and offer a callback.",
  ].join("\n");

  const channelGuidance =
    channel === "voice"
      ? "## Channel\nThis is a phone call transcribed to text. Keep replies short " +
        "and natural to hear aloud — one or two sentences, one question at a time."
      : "## Channel\nThis is a website chat widget. Keep replies short and " +
        "friendly — a sentence or two, easy to read on a phone.";

  const ownerCorrections = formatCorrections(corrections);

  return [base, bookingProtocol, edgeCases, channelGuidance, ownerCorrections]
    .filter((section): section is string => section !== null)
    .join("\n\n");
}
