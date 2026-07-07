# HVAC AI Receptionist — Design Document

## 1. Core Architecture Principle

This is a **multi-tenant SaaS platform**, not one app rebuilt per client. One codebase serves every client, differentiated by a `business_id`. Onboarding a new client means creating a new database row and running a scrape/setup step — never writing new code. Every prompt below is written to reinforce this.

## 2. User Flows

**Owner (client) flow:**
Sign up / get onboarded → business profile created (services, pricing, area, hours) → receive embed code + dedicated phone number → log into dashboard → see conversations, bookings, missed calls in real time → get notified per booking → adjust AI knowledge/settings as needed → billed automatically monthly.

**End customer (homeowner) flow:**
Visits client's site or calls after hours → talks to AI via chat widget or phone → AI answers questions using that business's real info → AI captures booking details if a job is wanted → customer gets confirmation that someone will follow up → business owner is notified immediately.

**You (platform operator) flow:**
Run a prospect through the demo generator on a sales call → close the sale → run onboarding flow (scrape their site, set services/pricing/area) → hand off embed code + phone number → client goes live → billing starts automatically.

## 3. Database Structure (Supabase / Postgres)

```
businesses
  id (uuid, pk)
  name
  owner_email
  phone_number (Twilio-assigned)
  service_area (text or geo radius)
  services (jsonb - list of services + descriptions + price ranges)
  hours (jsonb)
  emergency_policy (text - how to handle after-hours emergencies)
  raw_scraped_content (text - original scrape, for reference/re-training)
  status (enum: trial, active, past_due, paused, canceled)
  stripe_customer_id
  stripe_subscription_id
  created_at

business_users
  id (uuid, pk)
  business_id (fk)
  email
  role (owner, staff)
  auth_user_id (fk to Supabase auth.users)

conversations
  id (uuid, pk)
  business_id (fk)
  channel (chat, voice)
  customer_name
  customer_phone
  transcript (jsonb - array of turns)
  outcome (booked, no_action, unclear, emergency_escalated, voicemail_left)
  ai_confidence_flag (boolean - AI wasn't sure, needs owner review)
  created_at

bookings
  id (uuid, pk)
  conversation_id (fk)
  business_id (fk)
  customer_name
  customer_phone
  requested_service
  preferred_time
  notes
  status (new, confirmed, owner_contacted, canceled)
  created_at

knowledge_corrections
  id (uuid, pk)
  business_id (fk)
  original_content (text)
  corrected_content (text)
  created_by (fk to business_users)
  created_at

notifications_log
  id (uuid, pk)
  business_id (fk)
  type (sms, email)
  related_booking_id (fk, nullable)
  status (sent, failed)
  created_at
```

## 4. API Routes (Next.js)

Updated to reflect what's actually implemented (audit fix, item 7) — the
dashboard's reads/writes turned out to be a better fit for Next.js Server
Actions and direct RLS-scoped Server Component queries than a separate REST
API, since the browser never calls them directly (only our own pages/forms
do) and RLS already enforces the same per-tenant guarantee a dedicated API
layer would. The public, unauthenticated surface (chat, voice, billing
webhooks, onboarding) is still real HTTP routes, since those ARE called by
external callers (the embeddable widget, Twilio, Stripe, the operator tool).

**Real HTTP routes** (`app/api/**/route.ts`):

```
POST /api/onboarding/scrape          - scrape a URL, return structured draft data
                                        (falls back to an empty/partial draft for
                                        manual entry if scraping or extraction fails —
                                        never fully blocks onboarding)
POST /api/onboarding/create-business - save business record after owner/operator confirms
                                        (or manually entered) draft
POST /api/chat                       - handle a chat widget message (public, business-scoped)
POST /api/voice/incoming             - Twilio webhook, incoming call
POST /api/voice/gather               - Twilio webhook, handle caller speech input
POST /api/voice/recording            - Twilio webhook, voicemail recording + transcription callback
POST /api/stripe/checkout            - create checkout session (setup fee + subscription)
POST /api/stripe/webhook             - handle Stripe events (idempotent via stripe_webhook_events)
POST /api/stripe/portal              - open the Stripe customer billing portal
POST /api/stripe/expire-grace        - CRON_SECRET-guarded daily sweep: past_due -> paused
                                        once the grace window elapses
POST /api/notifications/digest       - CRON_SECRET-guarded daily batched-activity summary
```

Booking creation (design §9) is NOT its own route — it's an internal function
call (`lib/booking/capture.ts`'s `createBooking`/`upsertLead`), invoked
directly by the shared conversation engine (`lib/conversation/engine.ts`) that
chat and voice both call. There is no network hop; "internal" here means
same-process, not a second HTTP call.

**Server Actions** (`app/dashboard/actions.ts`, called only from the
dashboard's own forms/buttons, each re-checking auth and scoping writes by
`business_id` even though they're reachable by direct POST):

```
updateBookingStatus(bookingId, status)     - update a booking's status (new/confirmed/owner_contacted/canceled)
saveBusinessSettings(prevState, formData)  - services, pricing, area, hours, emergency policy, average job value
saveNotificationPreferences(...)           - alert channels, owner_phone (for SMS), daily-digest opt-in
submitCorrection(prevState, formData)      - owner submits a correction to AI knowledge
```

**Dashboard reads** — the pages that would otherwise be
`GET /api/dashboard/summary|conversations|bookings` are Server Components that
query Supabase directly (`app/dashboard/page.tsx`,
`app/dashboard/conversations/page.tsx`, `app/dashboard/bookings/page.tsx`),
scoped automatically by Row Level Security via the signed-in user's session —
the same tenant-isolation guarantee a dedicated API would need to re-implement.

## 5. Component Structure (Next.js/React)

```
/app
  /dashboard
    /page.tsx                 - overview: cards for conversations, bookings, missed calls, AI performance
    /conversations/page.tsx   - conversation list + transcript viewer
    /bookings/page.tsx        - booking list, status management
    /settings/page.tsx        - business info, services, pricing, hours, emergency policy
    /knowledge/page.tsx       - view/correct what the AI knows
    /billing/page.tsx         - subscription status, invoices
  /onboarding
    /page.tsx                 - operator-facing: URL in, review scraped data, confirm, generate embed code
  /widget
    /embed.js                 - the injectable widget script
  /components
    /dashboard (cards, tables, charts)
    /chat (widget UI)
    /shared (nav, auth guard, buttons, design system primitives)
```

## 6. Authentication

- Supabase Auth for dashboard login (owner + staff roles via `business_users`).
- Each authenticated request scoped to the user's `business_id` — no cross-tenant data access, enforced at the query level (Row Level Security in Supabase, not just app logic).
- Widget and voice endpoints are public but scoped by `business_id` passed in the request — no login needed for end customers.

## 7. Client Onboarding Process

1. Operator (you) enters a prospect's URL into the onboarding tool.
2. System scrapes the site, extracts a **draft** of services, pricing, area, hours.
3. Operator reviews/edits the draft (scraped data is never trusted blindly — always a human confirms before going live).
4. On confirm: business record created, Twilio number provisioned, embed code + phone number generated.
5. Owner gets a welcome email with dashboard login, embed code, and their new phone number.
6. Business status = `trial` until first Stripe payment succeeds, then `active`.

## 8. Twilio Call Flow

1. Call comes into the client's assigned Twilio number (either always, or forwarded from their existing line after N unanswered rings — support both modes).
2. Twilio webhook hits `/api/voice/incoming`, which loads that business's context.
3. AI greets caller by business name, asks how it can help.
4. Speech-to-text captures caller's response, sent to Claude with business context, response converted to speech (short, natural phrasing — not chat-length answers).
5. If booking intent detected: AI collects name, phone, service, preferred time, confirms it back, tells caller someone will follow up, saves booking, triggers owner notification.
6. If AI can't understand caller after 2 attempts, or intent is unclear: fall back to "let me take a message" voicemail-style recording, save as conversation with `outcome: voicemail_left`, flag for owner.
7. If caller signals an emergency (gas smell, flooding, no heat in freezing temps, etc. — defined per business in `emergency_policy`): AI gives the business's specific emergency instructions (e.g. "call this number directly" or "we'll call you back within 15 minutes") rather than attempting normal booking flow, and flags the conversation as `emergency_escalated` with a high-priority instant notification to the owner.

## 9. Booking Flow

1. AI (chat or voice) detects booking intent during conversation.
2. AI collects: name, phone, service requested, preferred time/urgency, any relevant notes (address if given, symptoms of the issue).
3. Booking record created, linked to the conversation.
4. Owner notified instantly (SMS preferred for speed — trades owners are on job sites, not email).
5. Booking appears in dashboard as `new` until owner marks it `confirmed` or `owner_contacted`.
6. If the AI is not confident it captured accurate info (e.g. customer was vague, cut off, or contradicted themselves), flag `ai_confidence_flag = true` so it surfaces distinctly in the dashboard for owner double-check.

## 10. Stripe Billing Flow

1. Operator closes the sale (in person, over the phone, or eventually self-serve).
2. Client enters card via Stripe Checkout: $500 one-time setup fee + $199/month subscription created together.
3. Webhook confirms payment → business status set to `active`.
4. Monthly renewal succeeds silently. Failure → status `past_due`, owner gets an email/SMS to update payment, grace period before `paused` (recommend 5-7 days).
5. `paused` status disables the widget and routes calls to a simple "this line is temporarily unavailable" message rather than deleting anything — never destroy client data on a billing lapse.

## 11. Per-Client AI Customization

No per-client code, ever. Every business has one row in `businesses` holding its services, pricing, area, hours, and emergency policy. The AI's system prompt is generated dynamically per request:

```
"You are the AI receptionist for {business.name}, a {trade type} company
serving {business.service_area}. Services: {business.services}.
Hours: {business.hours}. If asked about anything outside these services
or area, be honest that you're not sure and offer to have someone follow
up. Emergency policy: {business.emergency_policy}."
```

Owners update their own info anytime via the dashboard settings page — no re-scraping or engineering work needed after initial onboarding.

## 12. Edge Cases to Handle Explicitly

- **Failed/incomplete booking** — customer starts giving info then disconnects or stops responding. Save partial info as a lead, don't lose it, flag as incomplete.
- **Unclear customer request** — AI should ask one clarifying question before giving up, not guess. If still unclear after that, capture contact info and flag for a human callback rather than making something up.
- **Emergency calls** — must never be treated like a normal booking. Detected via keyword/context signals, routed per that business's defined emergency policy, always high-priority owner notification.
- **Incorrect AI answers** — owner needs a fast way to see a conversation where the AI got something wrong and submit a correction (see `knowledge_corrections` table) that immediately updates what the AI says going forward.
- **Client-specific pricing** — AI should give price *ranges* the business is comfortable quoting, never invent exact numbers, and should default to "final price depends on details, but typically X-Y" language.
- **Service-area limits** — if a customer is outside the business's stated area, AI should say so honestly rather than booking a job the business can't fulfill, and note it as a `no_action` outcome.
- **After-hours vs business-hours routing** — behavior may differ (e.g. business hours: AI supplements a human who might also answer; after-hours: AI is the only responder) — configurable per business.
- **Owner notification fatigue** — not every conversation needs an SMS blast; reserve instant notifications for actual bookings and emergencies, batch/digest lower-priority activity (e.g. "5 new conversations today, view dashboard") for a daily summary instead.

## 13. Design System / UI Direction

- Clean, modern SaaS aesthetic — think Linear or Stripe Dashboard, not a cluttered admin panel.
- Card-based dashboard home: four clear cards up top (conversations today, bookings today, missed calls, revenue potential captured) so value is obvious at a glance without clicking anywhere.
- Simple left-nav or top-nav: Dashboard, Conversations, Bookings, Knowledge/Settings, Billing. No more than these five destinations.
- Strong, obvious CTA buttons (e.g. "View Booking," "Correct This Answer") — trades owners are busy and non-technical, so nothing should require hunting.
- Mobile-first responsive — owners will check this from a truck or job site far more than a desktop.
- Color/tone: trustworthy and calm (blues/greens/neutral grays), not flashy startup gradient — this audience trusts "solid and professional" over "cutting edge."
- Every number on the dashboard should tie back to money where possible (e.g. "$1,200 in potential jobs captured this week") since that's what makes the $199/month obviously worth it.
