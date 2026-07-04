/**
 * Centralized, typed access to environment variables.
 *
 * Phase 1 needs Supabase only. Future services (Claude, Twilio, Stripe) are
 * declared here so the config pattern is established now, but they are read
 * lazily and are optional — the app runs before they're populated. Required
 * vars fail fast with a clear message when accessed.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and set it.`,
    );
  }
  return value;
}

/** Public (browser-safe) config. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;

/**
 * Server-only config. Access properties on demand so that unset future-phase
 * secrets don't throw until a feature that needs them is actually used.
 */
export const serverEnv = {
  /** Bypasses RLS — never expose to the client. */
  get supabaseServiceRoleKey(): string {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  get anthropicApiKey(): string {
    return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  },
  get twilio() {
    return {
      accountSid: required("TWILIO_ACCOUNT_SID", process.env.TWILIO_ACCOUNT_SID),
      authToken: required("TWILIO_AUTH_TOKEN", process.env.TWILIO_AUTH_TOKEN),
      phoneNumber: required("TWILIO_PHONE_NUMBER", process.env.TWILIO_PHONE_NUMBER),
    };
  },
  get stripe() {
    return {
      secretKey: required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY),
      webhookSecret: required(
        "STRIPE_WEBHOOK_SECRET",
        process.env.STRIPE_WEBHOOK_SECRET,
      ),
      priceSetupFee: required(
        "STRIPE_PRICE_SETUP_FEE",
        process.env.STRIPE_PRICE_SETUP_FEE,
      ),
      priceSubscription: required(
        "STRIPE_PRICE_SUBSCRIPTION",
        process.env.STRIPE_PRICE_SUBSCRIPTION,
      ),
    };
  },
} as const;
