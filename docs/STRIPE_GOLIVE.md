# Stripe: switching from test mode to live

Everything in Phase 5 runs against Stripe **test mode**. Work through this list
to go live. Nothing in the code changes — only env vars and Stripe Dashboard
configuration.

## 1. API keys
- In the Stripe Dashboard, toggle **off** "Test mode".
- Copy the **live** keys and set:
  - `STRIPE_SECRET_KEY=sk_live_…`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…` (reserved; unused today)

## 2. Products & prices (recreate in live mode)
Test and live objects are separate — recreate the two prices in live mode:
- A **one-time** price of **$500** (the setup fee).
- A **recurring** price of **$199 / month** (the subscription).
- Set the resulting live price IDs:
  - `STRIPE_PRICE_SETUP_FEE=price_…`   (the one-time $500 price)
  - `STRIPE_PRICE_SUBSCRIPTION=price_…` (the recurring $199/mo price)

> The checkout session sends both as line items in `mode: "subscription"`, so the
> $500 lands on the first invoice alongside the first $199, then $199 recurs.

## 3. Webhook endpoint
- Dashboard → Developers → Webhooks → **Add endpoint**.
- URL: `https://<your-domain>/api/stripe/webhook`
- Subscribe to exactly these events (all the app handles):
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`
- Copy the endpoint's **Signing secret** → `STRIPE_WEBHOOK_SECRET=whsec_…`.

## 4. Customer portal
- Dashboard → Settings → **Billing → Customer portal** → activate.
- Allow customers to update payment methods and view invoices (and cancel, if
  desired). The "Manage billing & payment method" button on the billing page
  opens this portal.

## 5. Grace-period cron
The past_due → paused transition is done by a sweep endpoint, not automatically.
- Set `CRON_SECRET` to a strong random string.
- Schedule a **daily** POST to `https://<your-domain>/api/stripe/expire-grace`
  with header `Authorization: Bearer <CRON_SECRET>` (e.g. Vercel Cron, a Supabase
  scheduled function, or any external scheduler).
- Optionally set `BILLING_GRACE_PERIOD_DAYS` (default 7; design §10 recommends 5–7).

## 6. App URL
- `NEXT_PUBLIC_APP_URL=https://<your-domain>` so Checkout/portal success and
  cancel redirects point at production.

## 7. Notifications (env-gated, already implemented)
Owner past_due/paused alerts are recorded in `notifications_log` and delivered
by the real adapters in `lib/notifications/adapters.ts`. To turn delivery on:
- **Email:** set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain
  verified in Resend). Unset = logs to console.
- **SMS:** set `SMS_ENABLED=true` (rides the existing Twilio creds) and make
  sure the owner saved a mobile number in Settings → Contact & alerts. Without
  a number, SMS alerts fall back to email automatically.

## 8. Smoke test in live mode
- Run one real (or Stripe test-clock) subscription through Checkout → confirm the
  business flips to `active` and `stripe_customer_id` / `stripe_subscription_id`
  are stored.
- Trigger a failed renewal → confirm `past_due` + a `notifications_log` row, and
  that the widget still serves during the grace window.
- Let grace elapse (or back-date it) and run the sweep → confirm `paused` and the
  neutral widget message; confirm no conversations/bookings were deleted.
