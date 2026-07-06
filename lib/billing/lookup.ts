import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessStatus } from "@/lib/types/database";

/**
 * Minimal billing-state fetch for the paused gate. Kept out of status.ts so that
 * module stays pure/unit-testable. Uses the service role because callers (the
 * public chat API, the widget frame) are unauthenticated; scoped by id.
 */
export interface BillingState {
  status: BusinessStatus;
  grace_period_ends_at: string | null;
}

export async function getBillingState(
  businessId: string,
): Promise<BillingState | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("businesses")
    .select("status, grace_period_ends_at")
    .eq("id", businessId)
    .maybeSingle<BillingState>();
  return data ?? null;
}
