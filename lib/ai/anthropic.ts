import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";

/**
 * The Claude model used across the platform. Centralized so chat (Phase 3) and
 * voice (Phase 6) stay consistent with onboarding extraction.
 *
 * Claude 5 note: on the 5-family models thinking is ON by default and counts
 * against max_tokens, so every call site pairs the model with an explicit
 * thinking/effort config (see engine.ts / extract.ts) instead of relying on
 * 4.x-era defaults.
 */
export const CLAUDE_MODEL = "claude-opus-5";

/**
 * Model for live phone turns (Phase 6). Voice is latency-sensitive — a caller is
 * waiting in silence — so we default to a faster Sonnet-class model instead of
 * Opus. Env-overridable so the exact id can be tuned per account without a code
 * change; falls back to the shared model if that variable is set empty.
 *
 * NOTE: verify this id is enabled for your Anthropic account before real calls.
 */
export const VOICE_CLAUDE_MODEL =
  process.env.VOICE_CLAUDE_MODEL?.trim() || "claude-sonnet-5";

/**
 * Hard cap on a single Claude call. Chat/voice callers already catch and fall
 * back gracefully on any error (see lib/conversation/engine.ts callers), but
 * without a timeout a hung request holds the request open until the SDK's own
 * (much longer) default — bad for a live phone call where the caller is
 * waiting in silence.
 */
const REQUEST_TIMEOUT_MS = 20_000;

let client: Anthropic | null = null;

/** Lazily-created Anthropic client. Reads the API key on first use, so the app
 * boots fine before the key is set. Server-only. */
export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: serverEnv.anthropicApiKey, timeout: REQUEST_TIMEOUT_MS });
  }
  return client;
}
