import { publicEnv } from "@/lib/env";

/**
 * Placeholder shown to a new client until real Twilio provisioning lands in
 * Phase 6. Kept as a constant so the UI and API agree on the wording.
 */
export const PHONE_NUMBER_PLACEHOLDER = "Pending — assigned when you go live";

/**
 * Generates the chat-widget embed snippet a client pastes into their site. The
 * widget script itself ships in Phase 3; this only wires the business id so the
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
