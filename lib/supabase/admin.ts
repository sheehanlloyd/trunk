import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client — **bypasses Row Level Security**. Server-only.
 *
 * Needed for operations that run outside any user's tenant session:
 *  - creating a brand-new business + its first owner row during onboarding
 *    (there is intentionally no INSERT RLS policy on those tables), and
 *  - reading a business by id from the chat/voice handlers (Phase 3/6), which
 *    have no logged-in user to satisfy RLS.
 *
 * Never import this into client components. No cookies/session are attached, so
 * every call must scope by `business_id` explicitly.
 */
export function createAdminClient() {
  return createSupabaseClient(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
