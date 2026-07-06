import { publicEnv } from "@/lib/env";

/**
 * Small helpers shared by the voice webhooks. Twilio posts
 * application/x-www-form-urlencoded bodies; we read them into a plain string map
 * (also what signature validation needs).
 */
export async function readTwilioForm(
  request: Request,
): Promise<Record<string, string>> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = typeof value === "string" ? value : "";
  }
  return params;
}

/** Absolute URL on our own origin, for the `action`/callback URLs in TwiML. */
export function voiceUrl(
  path: string,
  query: Record<string, string | number>,
): string {
  const qs = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString();
  return `${publicEnv.appUrl}${path}?${qs}`;
}
