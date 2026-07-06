import { NextResponse } from "next/server";

import { getBillingState } from "@/lib/billing/lookup";
import { isPaused } from "@/lib/billing/status";
import { handleTurn } from "@/lib/conversation/engine";

export const runtime = "nodejs";

/**
 * POST /api/chat — the customer-facing chat endpoint.
 *
 * Public and unauthenticated (it's called from the embeddable widget on third-
 * party sites). It never trusts client-supplied history: given a `businessId`
 * and `message` (+ optional `conversationId`), the engine loads the transcript
 * from the DB, runs one turn, persists it, and returns the reply.
 *
 * In practice the widget calls this same-origin from inside our iframe, so CORS
 * isn't needed for the real flow — but we allow cross-origin anyway (public, no
 * cookies) so the endpoint is robust if called directly.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

interface ChatBody {
  businessId?: unknown;
  message?: unknown;
  conversationId?: unknown;
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
  const message = typeof body.message === "string" ? body.message : "";
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : null;

  if (!businessId) {
    return json({ error: "businessId is required." }, 400);
  }
  if (!message.trim()) {
    return json({ error: "message is required." }, 400);
  }
  if (message.length > 4000) {
    return json({ error: "message is too long." }, 400);
  }

  // Billing gate (design §10): a paused business (or a past_due one whose grace
  // window has elapsed) doesn't answer — we return a neutral message WITHOUT
  // calling the model or writing any conversation rows. Data is never touched.
  const billing = await getBillingState(businessId);
  if (billing && isPaused(billing.status, billing.grace_period_ends_at)) {
    return json({
      conversationId: null,
      reply:
        "This line is temporarily unavailable. Please try again later or reach out another way.",
      outcome: "no_action",
      emergency: false,
      paused: true,
    });
  }

  try {
    const result = await handleTurn({
      businessId,
      conversationId,
      message,
      channel: "chat",
    });
    return json({
      conversationId: result.conversationId,
      reply: result.reply,
      outcome: result.outcome,
      emergency: result.emergency,
    });
  } catch (err) {
    console.error("[api/chat] turn failed", err);
    return json(
      { error: "Sorry — something went wrong. Please try again." },
      500,
    );
  }
}
