import { notifyOwner } from "@/lib/notifications/send";
import { assertTwilioRequest } from "@/lib/twilio/signature";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Business,
  Conversation,
  ConversationTurn,
} from "@/lib/types/database";
import { readTwilioForm } from "@/lib/voice/http";
import { sayAndHangupTwiml, twimlResponse } from "@/lib/voice/twiml";

export const runtime = "nodejs";

const VOICEMAIL_PREFIX = "[Voicemail]";

/**
 * POST /api/voice/recording — the voicemail callback (design §8, step 6). Two
 * kinds of request land here:
 *   - `<Record action>` completion: save the recording as a conversation turn,
 *     flag the conversation `voicemail_left`, and alert the owner to follow up.
 *   - `transcribeCallback` (?kind=transcription): best-effort attach the
 *     transcribed text to that voicemail turn once Twilio finishes it (async).
 * Only status changes/inserts — no data is ever deleted.
 */
export async function POST(request: Request) {
  const params = await readTwilioForm(request);
  if (!assertTwilioRequest(request, params)) {
    return twimlResponse(sayAndHangupTwiml("Goodbye."));
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId") || "";
  const kind = searchParams.get("kind");

  const supabase = createAdminClient();

  if (kind === "transcription") {
    await attachTranscription(supabase, conversationId, params.TranscriptionText ?? "");
    // Twilio ignores the response body for a transcribeCallback.
    return new Response(null, { status: 204 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle<Conversation>();

  if (!conversation) {
    return twimlResponse(sayAndHangupTwiml("Thanks. Goodbye."));
  }

  const recordingUrl = (params.RecordingUrl ?? "").trim();
  const voicemailTurn: ConversationTurn = {
    role: "customer",
    text: recordingUrl ? `${VOICEMAIL_PREFIX} ${recordingUrl}` : `${VOICEMAIL_PREFIX} (no recording)`,
  };
  const fromNumber = (params.From ?? "").trim() || null;

  await supabase
    .from("conversations")
    .update({
      transcript: [...conversation.transcript, voicemailTurn],
      outcome: "voicemail_left",
      customer_phone: conversation.customer_phone ?? fromNumber,
    })
    .eq("id", conversation.id);

  // Alert the owner to follow up (normal priority — not an emergency).
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, owner_email, notification_preferences")
    .eq("id", conversation.business_id)
    .maybeSingle<
      Pick<Business, "id" | "name" | "owner_email" | "notification_preferences">
    >();

  if (business) {
    await notifyOwner({
      business,
      reason: "voicemail",
      subject: `New voicemail — ${business.name}`,
      body:
        `A caller left a voicemail for ${business.name}` +
        (fromNumber ? ` from ${fromNumber}` : "") +
        (recordingUrl ? `. Listen: ${recordingUrl}` : "") +
        `. Open your dashboard to follow up.`,
    });
  }

  return twimlResponse(
    sayAndHangupTwiml("Thanks for your message. Someone will get back to you soon. Goodbye."),
  );
}

/** Replaces the recording-URL placeholder on the voicemail turn with the text. */
async function attachTranscription(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  text: string,
): Promise<void> {
  if (!conversationId || !text.trim()) return;
  const { data: conversation } = await supabase
    .from("conversations")
    .select("transcript")
    .eq("id", conversationId)
    .maybeSingle<Pick<Conversation, "transcript">>();
  if (!conversation) return;

  // Update the last voicemail turn in place, keeping the recording link.
  const transcript = [...conversation.transcript];
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].text.startsWith(VOICEMAIL_PREFIX)) {
      transcript[i] = {
        ...transcript[i],
        text: `${transcript[i].text}\nTranscript: ${text.trim()}`,
      };
      break;
    }
  }
  await supabase
    .from("conversations")
    .update({ transcript })
    .eq("id", conversationId);
}
