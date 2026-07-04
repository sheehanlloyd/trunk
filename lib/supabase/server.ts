import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Uses the anon key + the request's auth cookies, so queries run under the
 * logged-in user's session and are enforced by Row Level Security.
 *
 * Next 16: cookies() is async and must be awaited.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` was called from a Server Component. This can be ignored
          // when the proxy is refreshing sessions (see lib/supabase/proxy.ts).
        }
      },
    },
  });
}
