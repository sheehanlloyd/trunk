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
  /** Reserved for client-side Stripe.js; unused today (we redirect via
   *  session.url server-side). Optional so the app runs before billing is set up. */
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
} as const;

/** Grace-period length (days) before a past_due business is paused. Design §10
 *  recommends 5–7; defaults to 7 when unset. */
export function billingGracePeriodDays(): number {
  const raw = Number.parseInt(process.env.BILLING_GRACE_PERIOD_DAYS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

/**
 * Whether to verify the X-Twilio-Signature on the voice webhooks. These are
 * public endpoints that trigger owner notifications, so validation MUST be on in
 * production. Defaults off so local/simulated webhook POSTs work in development.
 */
export function validateTwilioSignature(): boolean {
  return process.env.TWILIO_VALIDATE_SIGNATURE === "true";
}

/**
 * Emails allowed to use the operator-only onboarding tool, parsed from the
 * comma-separated `OPERATOR_EMAILS` var. Lowercased for case-insensitive
 * comparison. Empty when unset — which means no one can onboard, failing safe.
 */
export function operatorEmails(): string[] {
  return (process.env.OPERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

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
  /** Shared secret guarding the daily grace-expiry cron endpoint. */
  get cronSecret(): string {
    return required("CRON_SECRET", process.env.CRON_SECRET);
  },
} as const;
