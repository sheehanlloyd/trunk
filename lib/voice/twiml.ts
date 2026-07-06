import twilio from "twilio";

import type { CallRoutingMode } from "@/lib/types/database";

/**
 * TwiML builders for the voice call flow (design §8). We use Twilio-native
 * speech: TTS via `<Say>` with an Amazon Polly Neural voice, STT via
 * `<Gather input="speech">`. Building with the SDK's VoiceResponse handles XML
 * escaping of caller/business text for us.
 */

const { VoiceResponse } = twilio.twiml;

/** Amazon Polly Neural voice — natural, and free within Twilio (no extra vendor). */
const VOICE = "Polly.Joanna-Neural" as const;

/** speechTimeout="auto" lets Twilio detect end-of-speech; the main latency knob. */
const GATHER_OPTS = {
  input: ["speech"] as ("speech")[],
  speechTimeout: "auto",
  method: "POST" as const,
  actionOnEmptyResult: true, // empty result still posts to `action` so we can count no-input
};

/** Wraps a TwiML string in a Response with the content type Twilio expects. */
export function twimlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function greetingText(businessName: string, mode: CallRoutingMode): string {
  // Forwarded callers dialed the client's own number and were routed here; direct
  // callers dialed the AI number. Slightly different framing for each.
  return mode === "forward"
    ? `Thanks for calling ${businessName}. I'm their virtual assistant picking up so we don't miss you. How can I help?`
    : `Thanks for calling ${businessName}. I'm their virtual assistant. How can I help you today?`;
}

/** Opening greeting + first speech gather. */
export function greetingTwiml(args: {
  businessName: string;
  mode: CallRoutingMode;
  actionUrl: string;
}): string {
  const vr = new VoiceResponse();
  const gather = vr.gather({ ...GATHER_OPTS, action: args.actionUrl });
  gather.say({ voice: VOICE }, greetingText(args.businessName, args.mode));
  // Safety net if no input event fires at all: retry the gather endpoint.
  vr.redirect({ method: "POST" }, args.actionUrl);
  return vr.toString();
}

/** Speak a line, then gather the caller's next response. */
export function replyAndGatherTwiml(args: {
  text: string;
  actionUrl: string;
}): string {
  const vr = new VoiceResponse();
  const gather = vr.gather({ ...GATHER_OPTS, action: args.actionUrl });
  gather.say({ voice: VOICE }, args.text);
  vr.redirect({ method: "POST" }, args.actionUrl);
  return vr.toString();
}

/**
 * Fallback to a voicemail-style recording (design §8, step 6). The recording
 * (and its transcription) posts to `recordActionUrl`, where we save it as a
 * conversation with outcome `voicemail_left` and alert the owner.
 */
export function voicemailTwiml(args: {
  prompt: string;
  recordActionUrl: string;
  transcribeCallbackUrl: string;
}): string {
  const vr = new VoiceResponse();
  vr.say({ voice: VOICE }, args.prompt);
  vr.record({
    maxLength: 120,
    playBeep: true,
    method: "POST",
    action: args.recordActionUrl,
    transcribe: true,
    transcribeCallback: args.transcribeCallbackUrl,
  });
  // Reached only if they hang up without recording.
  vr.say({ voice: VOICE }, "We didn't get a message. Goodbye.");
  vr.hangup();
  return vr.toString();
}

/** Speak a final line and end the call. */
export function sayAndHangupTwiml(text: string): string {
  const vr = new VoiceResponse();
  vr.say({ voice: VOICE }, text);
  vr.hangup();
  return vr.toString();
}
