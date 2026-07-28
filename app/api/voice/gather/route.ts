import { handleTurn } from "@/lib/conversation/engine";
import { rateLimit } from "@/lib/rateLimit";
import { assertTwilioRequest } from "@/lib/twilio/signature";
import { readTwilioForm, voiceUrl } from "@/lib/voice/http";
import {
  decideVoiceNext,
  nextAttempts,
  type VoiceAction,
  type VoiceTurnState,
} from "@/lib/voice/router";
import {
  replyAndGatherTwiml,
  sayAndHangupTwiml,
  twimlResponse,
  voicemailTwiml,
} from "@/lib/voice/twiml";

export const runtime = "nodejs";

const REPROMPT = "Sorry, I didn't quite catch that. Could you say that again?";
const VOICEMAIL_PROMPT =
  "Let me take a message and someone will get back to you. After the beep, " +
  "please say your name, your number, and what you need, then hang up.";

/**
 * POST /api/voice/gather — one turn of the call (design §8). Speech-to-text
 * arrives as `SpeechResult`; we run it through the SAME `handleTurn` engine as
 * chat (channel "voice"), then `decideVoiceNext` picks what happens next:
 * continue, handle an emergency, re-prompt, or fall back to voicemail after 2
 * failed attempts. Booking + emergency owner alerts are fired inside the engine.
 */
export async function POST(request: Request) {
  const params = await readTwilioForm(request);
  if (!assertTwilioRequest(request, params)) {
    return twimlResponse(sayAndHangupTwiml("Sorry, we can't continue this call."));
  }

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId") ?? "";
  const conversationId = searchParams.get("conversationId") || null;
  const attempts = Number.parseInt(searchParams.get("attempts") ?? "0", 10) || 0;

  // Per-business: each Claude turn costs money, and a call can loop through
  // many gather turns, so cap turns per business per minute across all calls.
  const limit = await rateLimit(`voice:gather:${businessId}`, 60, 60_000);
  if (!limit.allowed) {
    return twimlResponse(
      sayAndHangupTwiml("We're getting a high volume of calls right now. Please try again shortly."),
    );
  }

  const speech = (params.SpeechResult ?? "").trim();
  const hasSpeech = speech.length > 0;

  // Run the turn only when we actually heard something. Reply defaults are used
  // for the no-speech and error paths where the model wasn't consulted.
  let reply = "";
  let state: VoiceTurnState = {
    hasSpeech,
    attempts,
    emergency: false,
    needsClarification: false,
  };

  if (hasSpeech) {
    try {
      const result = await handleTurn({
        businessId,
        conversationId,
        message: speech,
        channel: "voice",
      });
      reply = result.reply;
      state = {
        hasSpeech: true,
        attempts,
        emergency: result.emergency,
        needsClarification: result.needsClarification,
      };
    } catch (err) {
      console.error("[voice/gather] handleTurn failed", { businessId, conversationId, error: err instanceof Error ? err.message : String(err) });
      // Treat a model/engine failure like a failed turn: reprompt, or voicemail
      // at the limit — never loop the caller in a broken state. Set a spoken
      // fallback so the "clarify" action (which speaks `reply`) doesn't leave
      // the caller in silence.
      reply = REPROMPT;
      state = { hasSpeech: true, attempts, emergency: false, needsClarification: true };
    }
  }

  const action = decideVoiceNext(state);
  const attemptsNext = nextAttempts(action, attempts);

  const gatherUrl = voiceUrl("/api/voice/gather", {
    businessId,
    conversationId: conversationId ?? "",
    attempts: attemptsNext,
  });

  return twimlResponse(buildTwiml(action, reply, businessId, conversationId, gatherUrl));
}

function buildTwiml(
  action: VoiceAction,
  reply: string,
  businessId: string,
  conversationId: string | null,
  gatherUrl: string,
): string {
  switch (action) {
    // Emergency and understood turns both speak the model's reply and keep the
    // caller on the line. (The urgent owner alert already fired in the engine.)
    case "emergency":
    case "continue":
      return replyAndGatherTwiml({ text: reply, actionUrl: gatherUrl });

    // Still unclear, under the limit: speak the AI's one clarifying question.
    case "clarify":
      return replyAndGatherTwiml({ text: reply, actionUrl: gatherUrl });

    // Heard nothing, under the limit: ask them to repeat.
    case "reprompt":
      return replyAndGatherTwiml({ text: REPROMPT, actionUrl: gatherUrl });

    // Out of attempts: take a voicemail.
    case "voicemail": {
      const recordUrl = voiceUrl("/api/voice/recording", {
        businessId,
        conversationId: conversationId ?? "",
      });
      const transcribeUrl = voiceUrl("/api/voice/recording", {
        businessId,
        conversationId: conversationId ?? "",
        kind: "transcription",
      });
      return voicemailTwiml({
        prompt: VOICEMAIL_PROMPT,
        recordActionUrl: recordUrl,
        transcribeCallbackUrl: transcribeUrl,
      });
    }
  }
}
