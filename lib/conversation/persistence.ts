import type {
  Business,
  Conversation,
  ConversationChannel,
  ConversationOutcome,
  ConversationTurn,
  KnowledgeCorrection,
} from "@/lib/types/database";

/**
 * DB layer for the conversation engine. Chat and voice are unauthenticated, so
 * every call uses the service-role client and is explicitly scoped by
 * `business_id`. The `conversations` row (its `transcript`) is the single
 * source of truth for history — client-supplied history is never trusted.
 *
 * The admin client is imported lazily inside each function so the engine's pure
 * helpers stay importable in unit tests without eager env validation.
 */

/** Loads a business row by id. Throws if it doesn't exist. */
export async function getBusiness(businessId: string): Promise<Business> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle<Business>();

  if (error) {
    throw new Error(`Failed to load business ${businessId}: ${error.message}`);
  }
  if (!data) throw new Error(`Business not found: ${businessId}`);
  return data;
}

/** Cap on corrections replayed into the prompt — bounds prompt size/cost. */
const MAX_CORRECTIONS = 50;

/**
 * Loads this business's knowledge corrections (design §12), newest first. These
 * are the owner's authoritative overrides to what the AI says; `handleTurn`
 * folds them into every turn's system prompt, so a correction submitted from the
 * dashboard takes effect on the very next customer message. Scoped by
 * business_id (service-role bypasses RLS, so the scope is enforced here).
 */
export async function getKnowledgeCorrections(
  businessId: string,
): Promise<KnowledgeCorrection[]> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("knowledge_corrections")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(MAX_CORRECTIONS)
    .returns<KnowledgeCorrection[]>();

  if (error) {
    throw new Error(
      `Failed to load knowledge corrections for ${businessId}: ${error.message}`,
    );
  }
  return data ?? [];
}

/**
 * Loads an existing conversation (scoped to the business so one tenant can't
 * read another's transcript) or creates a fresh one. Returns the row either way.
 *
 * `callSid` (Twilio's per-call identifier) makes this idempotent for the one
 * caller that creates voice conversations, `/api/voice/incoming`: Twilio
 * retries webhook deliveries, and without a lookup key a retry would insert a
 * second `conversations` row for the same call. When `callSid` is provided
 * and no `conversationId` is given, this looks up by `call_sid` first and
 * only inserts on a genuine miss (unique index on `call_sid`, migration 0009).
 */
export async function loadOrCreateConversation(args: {
  businessId: string;
  conversationId?: string | null;
  channel: ConversationChannel;
  callSid?: string | null;
}): Promise<Conversation> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  if (args.conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", args.conversationId)
      .eq("business_id", args.businessId)
      .maybeSingle<Conversation>();

    if (error) {
      throw new Error(`Failed to load conversation: ${error.message}`);
    }
    if (!data) {
      throw new Error("Conversation not found for this business.");
    }
    return data;
  }

  if (args.callSid) {
    const { data: existing, error: lookupError } = await supabase
      .from("conversations")
      .select("*")
      .eq("call_sid", args.callSid)
      .eq("business_id", args.businessId)
      .maybeSingle<Conversation>();

    if (lookupError) {
      throw new Error(`Failed to look up conversation by call: ${lookupError.message}`);
    }
    if (existing) return existing;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      business_id: args.businessId,
      channel: args.channel,
      call_sid: args.callSid ?? null,
      transcript: [],
      outcome: null,
      ai_confidence_flag: false,
    })
    .select("*")
    .single<Conversation>();

  if (!error && data) return data;

  // 23505 = unique_violation on call_sid: a concurrent/retried webhook won the
  // race to insert first. Fetch the row it created instead of failing the call.
  if (error?.code === "23505" && args.callSid) {
    const { data: existing, error: lookupError } = await supabase
      .from("conversations")
      .select("*")
      .eq("call_sid", args.callSid)
      .eq("business_id", args.businessId)
      .maybeSingle<Conversation>();
    if (!lookupError && existing) return existing;
  }

  throw new Error(`Failed to create conversation: ${error?.message ?? "no row"}`);
}

/** Persists the turn's results back onto the conversation row. */
export async function saveConversation(
  conversationId: string,
  update: {
    transcript: ConversationTurn[];
    outcome: ConversationOutcome | null;
    customerName: string | null;
    customerPhone: string | null;
    aiConfidenceFlag: boolean;
  },
): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("conversations")
    .update({
      transcript: update.transcript,
      outcome: update.outcome,
      customer_name: update.customerName,
      customer_phone: update.customerPhone,
      ai_confidence_flag: update.aiConfidenceFlag,
    })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Failed to save conversation: ${error.message}`);
  }
}
