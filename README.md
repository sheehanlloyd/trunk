# Trunk

An AI receptionist for the trades. Trunk answers phone calls and website chats for HVAC, plumbing, and electrical companies 24/7, books the job, and texts the owner the details — so a missed call stops meaning a missed $350 job.

I built this because every trades owner I've talked to has the same problem: they're on a roof or under a sink when the phone rings, and the caller doesn't leave a voicemail — they call the next name on Google. Trunk picks up instead.

## What it does

- **Answers every call** on a dedicated Twilio number — after hours, weekends, whenever. Callers talk to an AI that knows the business's real services, price ranges, hours, and service area.
- **Chats on the website** through an embeddable widget (one script tag, customizable colors/greeting/position from the dashboard).
- **Books jobs**, not just "takes messages" — it collects name, phone, service, and preferred time, confirms it back, and won't claim a booking unless it actually captured the details.
- **Escalates emergencies** (gas smell, burst pipe, no heat in a freeze) per each business's own policy, with an instant SMS to the owner.
- **Saves the ones that got away** — if a caller bails mid-booking, whatever was captured lands on a Leads page for a callback instead of vanishing.
- **Texts the owner instantly** for bookings and emergencies, and batches everything else into a daily digest, because nobody wants 40 pings a day.
- **Shows the money** — the dashboard leads with revenue captured, and the analytics page has booking conversion, peak call hours, and channel breakdowns.
- **Learns corrections** — the owner fixes a wrong answer once and the AI uses their wording from then on. There's a built-in test console, so you can ask your AI anything a customer might and see exactly what it would do — including whether it would book, escalate, or flag — without touching your live widget.
- **Closes the loop on callbacks** — one tap converts a recovered lead into a booking, adds any job to your calendar as an .ics file, and texts the customer a review request when the work's done.
- **Reports itself** — Claude-generated insights on what customers keep asking, a print-ready weekly report, CSV exports, and a live-refreshing dashboard with a setup checklist and emergency alerts.
- **Runs itself** — team seats for staff, widget theming with a live preview (colors, greeting, corner, teaser bubble), and Stripe billing with a grace period that never deletes anyone's data.

One codebase serves every client. Onboarding a new business means scraping their website, reviewing the extracted draft, and clicking confirm — a new row in the database, never new code. That's the whole thesis.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + Tailwind v4 (CSS-first config)
- **Supabase** — Postgres + Auth, with row-level security doing the real multi-tenant enforcement
- **Claude** (Anthropic API) — Opus for chat/extraction/insights, Sonnet for latency-sensitive voice turns
- **Twilio** — phone numbers, voice webhooks, SMS
- **Stripe** — $500 setup + $199/mo subscriptions, webhook-driven status transitions
- **Resend** — email alerts (optional; logs to console when unconfigured)

No component library, no ORM, no CSS framework beyond Tailwind. The charts are hand-rolled SVG.

## Getting started

You'll need Node 20+, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
git clone <this repo> && cd trunk
npm install
cp .env.example .env.local   # fill in at minimum the Supabase vars

supabase start               # local Postgres + Auth on :54321
supabase db reset            # apply migrations + seed two demo tenants
npm run dev
```

Open http://localhost:3000. The seed creates two demo businesses; to poke around a fully-populated dashboard:

```bash
npx tsx scripts/test-rls.ts      # creates the demo owner auth users (and proves tenant isolation)
npx tsx scripts/seed-demo.ts     # fills Cool Breeze HVAC with a month of realistic activity
```

Then log in as `owner@coolbreeze.test` / `test-password-a1!`.

Everything degrades gracefully: without an `ANTHROPIC_API_KEY` the AI endpoints fail politely, without Stripe keys billing pages explain themselves, and SMS/email log to the console until you flip them on (`SMS_ENABLED`, `RESEND_API_KEY`). You can run the dashboard with nothing but Supabase configured.

## How it's put together

```
app/
  page.tsx              the marketing site
  (auth)/               login, invite acceptance, password reset
  dashboard/            the owner's app: home, conversations, bookings, leads,
                        analytics, reports, activity, knowledge, settings, billing
  admin/                operator-only cross-tenant view
  onboarding/           operator tool: scrape a site -> review -> create tenant
  widget/frame          the iframe the embeddable chat widget loads
  api/                  chat, voice webhooks, Stripe, exports (CSV + .ics), cron
lib/
  conversation/         the engine: one Claude call per turn, deterministic
                        booking/lead/emergency decisions layered on top;
                        dryRun.ts runs the same path with no writes (test console)
  ai/ booking/ voice/   prompts, capture rules, TwiML + call routing
  billing/ notifications/ onboarding/ insights/ analytics/ export/
components/
  shared/               the design system primitives — Card, Button, Input,
                        StatusBadge, PageLayout, NavBar. Style changes go here,
                        not into pages.
  marketing/ analytics/ dashboard/ chat/
supabase/migrations/    schema + RLS, numbered and commented
```

Design tokens live in `app/globals.css` (`@theme`): `brand-*` for interactive
surfaces, `revenue-*` for money and nothing else, `copper-*` for attention,
`ink-*` for neutrals, plus the shadow and radius scales. If you find yourself
writing a raw hex in a component, it belongs in there instead.

A few decisions worth knowing about before you read the code:

- **RLS is the security model.** Dashboard reads go through a cookie-scoped Supabase client and Postgres row-level security — app code never filters tenants by hand. The public endpoints (chat, voice, webhooks) use the service role and scope by `business_id` explicitly. `scripts/test-rls.ts` logs in as one tenant and actively attacks the other to prove isolation.
- **The AI never books on vibes.** The model returns structured output (reply + intent + captured fields), and plain TypeScript decides whether that's a real booking, a lead worth saving, or an emergency. A model claiming "booking confirmed" without a usable phone number gets flagged, not booked.
- **Webhooks are idempotent.** Stripe events go through an event-id ledger; Twilio retries are deduped on CallSid; bookings upsert on conversation id. Retried deliveries can't double-book or double-charge.
- **Billing never destroys data.** Payment failure → grace period → paused (widget off, calls get a polite message). Rows are never deleted for money reasons.

## Testing

```bash
npm test                          # unit tests (pure logic: engine decisions, prompts, billing, CSV, TwiML...)
npx tsx scripts/test-rls.ts       # tenant isolation against local Supabase
npx tsx scripts/eval-edge-cases.ts  # 17 real-Claude evals of the conversation engine
npm run build                     # the real gate — typed routes, RSC boundaries
```

The unit suite runs in a few hundred milliseconds and has no network or DB dependencies. The eval script costs real API tokens; run it when you touch prompts.

## Deploying

It's a standard Next.js app — Vercel works out of the box. The go-live specifics (Twilio number provisioning, Stripe live keys, webhook URLs, the two cron jobs, DNS for email) are written up in [`docs/`](docs/):

- [`STRIPE_GOLIVE.md`](docs/STRIPE_GOLIVE.md) — billing setup end to end
- [`VOICE_SETUP.md`](docs/VOICE_SETUP.md) — Twilio config + how to simulate calls locally
- [`CRON_JOBS.md`](docs/CRON_JOBS.md) — the grace-expiry sweep and daily digest
- [`PHASE7_HARDENING.md`](docs/PHASE7_HARDENING.md) — the security/abuse pass and what it covers

Rate limiting uses a shared Redis counter when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set, and falls back to per-instance in-memory counting otherwise — including when Redis is unreachable, because a limiter that takes the API down with it is worse than one that briefly degrades to per-instance accuracy. Set both if you run more than one instance.

## License

No license yet — all rights reserved while I figure that out. Open an issue if you want to use it for something.
