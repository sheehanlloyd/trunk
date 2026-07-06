import { isPaused } from "@/lib/billing/status";
import { loadOrCreateConversation } from "@/lib/conversation/persistence";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertTwilioRequest } from "@/lib/twilio/signature";
import type { CallRoutingMode, BusinessStatus } from "@/lib/types/database";
import { readTwilioForm, voiceUrl } from "@/lib/voice/http";
import {
  greetingTwiml,
  sayAndHangupTwiml,
  twimlResponse,
} from "@/lib/voice/twiml";

export const runtime = "nodejs";

interface CallBusiness {
  id: string;
  name: string;
  status: BusinessStatus;
  grace_period_ends_at: string | null;
  call_routing_mode: CallRoutingMode;
}

/**
 * POST /api/voice/incoming — Twilio webhook for an inbound call (design §8).
 * Resolves the business from the dialed number (works for BOTH routing modes:
 * direct dial and forward-after-N-rings both ring the Twilio number), greets by
 * name via TTS, and opens a speech gather. No LLM call here — the greeting is
 * static so the caller hears something immediately.
 */
export async function POST(request: Request) {
  const params = await readTwilioForm(request);
  if (!assertTwilioRequest(request, params)) {
    return twimlResponse(sayAndHangupTwiml("Sorry, we can't take your call right now."));
  }

  const to = (params.To ?? "").trim(); // the Twilio number that was dialed

  const supabase = createAdminClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, status, grace_period_ends_at, call_routing_mode")
    .eq("phone_number", to)
    .maybeSingle<CallBusiness>();

  if (!business) {
    return twimlResponse(
      sayAndHangupTwiml("Sorry, this number isn't set up to take calls yet. Goodbye."),
    );
  }

  // Same billing gate as the widget/chat: a paused business doesn't answer.
  if (isPaused(business.status, business.grace_period_ends_at)) {
    return twimlResponse(
      sayAndHangupTwiml(
        "This line is temporarily unavailable. Please try again later. Goodbye.",
      ),
    );
  }

  // Create the conversation now so its id threads through gather + voicemail.
  const conversation = await loadOrCreateConversation({
    businessId: business.id,
    channel: "voice",
  });

  const actionUrl = voiceUrl("/api/voice/gather", {
    businessId: business.id,
    conversationId: conversation.id,
    attempts: 0,
  });

  return twimlResponse(
    greetingTwiml({
      businessName: business.name,
      mode: business.call_routing_mode,
      actionUrl,
    }),
  );
}
