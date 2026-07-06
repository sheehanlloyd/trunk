import type {
  Business,
  Conversation,
  ConversationChannel,
  ConversationOutcome,
  ConversationTurn,
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

/**
 * Loads an existing conversation (scoped to the business so one tenant can't
 * read another's transcript) or creates a fresh one. Returns the row either way.
 */
export async function loadOrCreateConversation(args: {
  businessId: string;
  conversationId?: string | null;
  channel: ConversationChannel;
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

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      business_id: args.businessId,
      channel: args.channel,
      transcript: [],
      outcome: null,
      ai_confidence_flag: false,
    })
    .select("*")
    .single<Conversation>();

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message ?? "no row"}`);
  }
  return data;
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
