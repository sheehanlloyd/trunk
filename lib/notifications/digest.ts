import type { ConversationOutcome } from "@/lib/types/database";

/**
 * Daily-digest aggregation (design §12: "Owner notification fatigue"). Bookings
 * and emergencies (and voicemails) already fire an INSTANT alert the moment they
 * happen — see lib/conversation/engine.ts and app/api/voice/recording. This
 * digest is the batched other half: a once-a-day summary of general activity so
 * an owner sees the day's picture without an SMS per conversation.
 *
 * The instant-alerted items are counted here as TOTALS only (never re-notified
 * individually); the actionable part of the digest is the leads that still need
 * a human follow-up.
 *
 * Kept as a pure function over already-fetched rows so it's fully unit-testable;
 * the route (app/api/notifications/digest) does the DB reads and the sending.
 */

/** Only the field the digest reads off a conversation. */
export interface DigestConversation {
  outcome: ConversationOutcome | null;
}

/** Only the field the digest reads off a lead. */
export interface DigestLead {
  reason: string | null;
}

export interface DigestCounts {
  conversations: number;
  booked: number;
  emergencies: number;
  voicemails: number;
  /** General Q&A that didn't book or escalate (no_action + unclear). */
  answered: number;
  leads: number;
  /** Follow-up leads bucketed by their reason code. */
  leadsByReason: Record<string, number>;
}

export interface DigestResult {
  /** False when nothing happened in the window — caller skips sending entirely. */
  hasActivity: boolean;
  counts: DigestCounts;
  subject: string;
  /** Plain-text body (SMS-safe: no markdown, symbols, or URLs). */
  body: string;
}

/** Human phrasing for a lead's reason code; unknown codes pass through as-is. */
function describeReason(reason: string, count: number): string {
  const label =
    reason === "incomplete"
      ? "an unfinished booking"
      : reason === "needs_callback"
        ? "a callback request"
        : reason === "out_of_area"
          ? "an out-of-area request"
          : reason === "engine_error"
            ? "a conversation the AI couldn't finish answering"
            : reason;
  // Naive pluralization is fine for this internal copy.
  return count === 1 ? label : `${count} ${label}s`;
}

/**
 * Rolls up a business's last-24h conversations and leads into a digest. Returns
 * `hasActivity: false` when the window is empty so the caller can skip the send
 * (no "you had 0 conversations" noise).
 */
export function buildDigest(input: {
  businessName: string;
  conversations: DigestConversation[];
  leads: DigestLead[];
}): DigestResult {
  const { businessName, conversations, leads } = input;

  const counts: DigestCounts = {
    conversations: conversations.length,
    booked: 0,
    emergencies: 0,
    voicemails: 0,
    answered: 0,
    leads: leads.length,
    leadsByReason: {},
  };

  for (const c of conversations) {
    switch (c.outcome) {
      case "booked":
        counts.booked += 1;
        break;
      case "emergency_escalated":
        counts.emergencies += 1;
        break;
      case "voicemail_left":
        counts.voicemails += 1;
        break;
      case "unclear":
      case "no_action":
      case null:
      default:
        counts.answered += 1;
        break;
    }
  }

  for (const l of leads) {
    const reason = (l.reason ?? "other").trim() || "other";
    counts.leadsByReason[reason] = (counts.leadsByReason[reason] ?? 0) + 1;
  }

  const hasActivity = counts.conversations > 0 || counts.leads > 0;

  // Headline sentence: the day's totals.
  const parts: string[] = [];
  if (counts.booked > 0) {
    parts.push(counts.booked === 1 ? "1 booking" : `${counts.booked} bookings`);
  }
  if (counts.emergencies > 0) {
    parts.push(
      counts.emergencies === 1 ? "1 emergency" : `${counts.emergencies} emergencies`,
    );
  }
  if (counts.voicemails > 0) {
    parts.push(
      counts.voicemails === 1 ? "1 voicemail" : `${counts.voicemails} voicemails`,
    );
  }
  if (counts.answered > 0) {
    parts.push(
      counts.answered === 1
        ? "1 question answered"
        : `${counts.answered} questions answered`,
    );
  }

  const convoLine =
    counts.conversations === 1
      ? "Your AI receptionist handled 1 conversation in the last 24 hours"
      : `Your AI receptionist handled ${counts.conversations} conversations in the last 24 hours`;

  const breakdown = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  // Leads are the part that actually needs the owner to act.
  let leadLine = "";
  if (counts.leads > 0) {
    const reasonParts = Object.entries(counts.leadsByReason).map(([reason, n]) =>
      describeReason(reason, n),
    );
    leadLine =
      ` ${counts.leads === 1 ? "1 lead needs" : `${counts.leads} leads need`} ` +
      `follow-up: ${reasonParts.join(", ")}.`;
  }

  const body =
    `${convoLine}${breakdown}.${leadLine} ` +
    `Open your dashboard to review.`;

  const subject = `Daily summary — ${businessName}`;

  return { hasActivity, counts, subject, body };
}
