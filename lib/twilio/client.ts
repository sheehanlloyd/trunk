import twilio, { type Twilio } from "twilio";

import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Server-only Twilio client + number provisioning (Phase 6, design §7 step 4 /
 * §8 step 1). Imported lazily by onboarding so `serverEnv.twilio` (which throws
 * when creds are unset) is only touched when provisioning actually runs.
 */

let cached: Twilio | null = null;

export function getTwilio(): Twilio {
  if (cached) return cached;
  const { accountSid, authToken } = serverEnv.twilio;
  cached = twilio(accountSid, authToken);
  return cached;
}

/**
 * Buys a US local, voice-capable number and points its voice webhook at our
 * incoming-call handler, then returns it in E.164. **Best-effort**: if Twilio is
 * unconfigured or any step fails, it logs and returns null so onboarding still
 * succeeds (the business just goes live without a number until this is retried).
 */
export async function provisionNumber(
  businessId: string,
): Promise<string | null> {
  try {
    const client = getTwilio();
    const voiceUrl = `${publicEnv.appUrl}/api/voice/incoming`;

    const available = await client
      .availablePhoneNumbers("US")
      .local.list({ voiceEnabled: true, limit: 1 });

    if (available.length === 0) {
      console.error("[twilio] no available numbers to provision");
      return null;
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      voiceUrl,
      voiceMethod: "POST",
      friendlyName: `AI Receptionist ${businessId}`,
    });

    return purchased.phoneNumber ?? null;
  } catch (err) {
    console.error("[twilio] provisionNumber failed", err);
    return null;
  }
}
