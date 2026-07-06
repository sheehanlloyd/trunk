import twilio from "twilio";

import { publicEnv, serverEnv, validateTwilioSignature } from "@/lib/env";

/**
 * Verifies a request genuinely came from Twilio (Phase 6). The voice webhooks
 * are public and trigger owner notifications, so in production this stops a
 * spoofer from POSTing fake calls. Validation is gated by TWILIO_VALIDATE_SIGNATURE
 * (see env.ts) so local/simulated POSTs work in development.
 *
 * Twilio signs the FULL request URL (including query string) plus the sorted
 * POST params, so we reconstruct the URL from the configured app origin + the
 * request's path and query.
 */
export function assertTwilioRequest(
  request: Request,
  params: Record<string, string>,
): boolean {
  if (!validateTwilioSignature()) return true;

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const { pathname, search } = new URL(request.url);
  const url = `${publicEnv.appUrl}${pathname}${search}`;

  return twilio.validateRequest(
    serverEnv.twilio.authToken,
    signature,
    url,
    params,
  );
}
