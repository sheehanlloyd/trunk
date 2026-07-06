import Stripe from "stripe";

import { serverEnv } from "@/lib/env";

/**
 * Server-only Stripe client (Phase 5, design §10). Memoized so we build one
 * instance per server process. Imported lazily by the billing routes/pages so
 * `serverEnv.stripe` (which throws when keys are unset) is only touched when a
 * billing feature actually runs — the rest of the app boots without Stripe keys.
 *
 * The API version is pinned to the one this SDK (v22) ships against so upgrades
 * are deliberate rather than silent.
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  cached = new Stripe(serverEnv.stripe.secretKey, {
    apiVersion: "2026-06-24.dahlia",
  });
  return cached;
}
