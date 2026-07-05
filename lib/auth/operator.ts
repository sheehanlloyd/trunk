import { operatorEmails } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** True when the given email is on the operator allowlist. */
export function isOperator(email: string | null | undefined): boolean {
  if (!email) return false;
  return operatorEmails().includes(email.toLowerCase());
}

/**
 * Resolves the currently logged-in operator, or null. Use in server components
 * and route handlers to gate the operator-only onboarding tool. Returns null
 * both for unauthenticated requests and for authenticated non-operators, so the
 * caller decides between redirect (pages) and 403 (APIs).
 */
export async function getOperator(): Promise<{ email: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isOperator(user.email)) return null;
  return { email: user.email };
}
