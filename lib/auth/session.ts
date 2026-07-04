import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Business, BusinessUser } from "@/lib/types/database";

export interface BusinessContext {
  /** The authenticated Supabase auth user id. */
  authUserId: string;
  /** The user's membership row (role, business_id). */
  membership: BusinessUser;
  /** The tenant this user belongs to. */
  business: Business;
}

/**
 * Resolves the current user's tenant context, or null if unauthenticated or
 * not linked to a business (an invited-but-unmatched account). All queries run
 * under RLS, so a user can never resolve another tenant's data.
 */
export async function getCurrentBusiness(): Promise<BusinessContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("business_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle<BusinessUser>();

  if (!membership) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", membership.business_id)
    .maybeSingle<Business>();

  if (!business) return null;

  return { authUserId: user.id, membership, business };
}

/**
 * Server-side auth gate for the dashboard. Redirects to /login when not signed
 * in. Returns null (rather than redirecting) when the user is authenticated but
 * has no linked business, so the caller can render a "no business" state.
 */
export async function requireAuth(): Promise<BusinessContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return getCurrentBusiness();
}
