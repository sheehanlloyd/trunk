import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";

/**
 * The Claude model used across the platform. Centralized so chat (Phase 3) and
 * voice (Phase 6) stay consistent with onboarding extraction.
 */
export const CLAUDE_MODEL = "claude-opus-4-6";

let client: Anthropic | null = null;

/** Lazily-created Anthropic client. Reads the API key on first use, so the app
 * boots fine before the key is set. Server-only. */
export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: serverEnv.anthropicApiKey });
  }
  return client;
}
