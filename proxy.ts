import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Next 16 renamed the `middleware` file convention to `proxy`.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files, so the
     * auth session is refreshed on every meaningful navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
