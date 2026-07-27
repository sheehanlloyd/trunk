import { publicEnv } from "@/lib/env";

/**
 * Placeholder shown when Twilio number provisioning fails or hasn't run —
 * the business goes live phone-less and the operator retries later. Kept as a
 * constant so the UI and API agree on the wording.
 */
export const PHONE_NUMBER_PLACEHOLDER = "Pending — assigned when you go live";

/**
 * Generates the chat-widget embed snippet a client pastes into their site
 * (the loader itself is public/widget.js). Only wires the business id so the
 * loaded widget knows which tenant it represents. Data-driven by `businessId`,
 * so it's identical for every client.
 */
export function buildEmbedCode(businessId: string): string {
  const src = `${publicEnv.appUrl.replace(/\/$/, "")}/widget.js`;
  return [
    `<!-- AI Receptionist widget -->`,
    `<script`,
    `  src="${src}"`,
    `  data-business-id="${businessId}"`,
    `  async`,
    `></script>`,
  ].join("\n");
}
