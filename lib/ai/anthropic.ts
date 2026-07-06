import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";

/**
 * The Claude model used across the platform. Centralized so chat (Phase 3) and
 * voice (Phase 6) stay consistent with onboarding extraction.
 */
export const CLAUDE_MODEL = "claude-opus-4-6";

/**
 * Model for live phone turns (Phase 6). Voice is latency-sensitive — a caller is
 * waiting in silence — so we default to a faster Sonnet-class model instead of
 * Opus. Env-overridable so the exact id can be tuned per account without a code
 * change; falls back to the shared model if that variable is set empty.
 *
 * NOTE: verify this id is enabled for your Anthropic account before real calls.
 */
export const VOICE_CLAUDE_MODEL =
  process.env.VOICE_CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";

let client: Anthropic | null = null;

/** Lazily-created Anthropic client. Reads the API key on first use, so the app
 * boots fine before the key is set. Server-only. */
export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: serverEnv.anthropicApiKey });
  }
  return client;
}
