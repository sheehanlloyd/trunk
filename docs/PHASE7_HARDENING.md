# Phase 7 — Go-Live Hardening: Edge-Case Review

Final review-and-patch pass over every edge case in `DESIGN.md §12` (plus billing
§10 and tenant isolation §6) before onboarding real paying clients.

**Headline:** the platform was in strong shape — 9 of 10 edge cases already worked
and are now proven with tests; 1 real gap (the daily digest) was built. All
verification is automated and green.

## How this was verified (three tiers)

- **Unit (vitest)** — `npx vitest run` → **51 passing** across 8 files. Pure logic:
  outcome decisions, voice routing, billing gate, greeting per routing mode, digest
  aggregation.
- **Real-model evals** — `npx tsx scripts/eval-edge-cases.ts` → **17/17 passing**.
  Scripts real customer transcripts through the exact production prompt +
  `messages.parse` + `decide()` path (in-memory businesses, no DB) to prove the
  model actually obeys the guardrails.
- **DB integration** — `npx tsx scripts/test-rls.ts` against local Supabase →
  **12/12 passing**. Authenticates as one tenant and actively attempts to read/write
  another tenant's rows; confirms the block is at the database (RLS) layer.

## Status of all 10 edge cases

| # | Edge case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Failed/incomplete booking → lead | **Working** | `decide()` unit tests + eval; `upsertLead(reason:"incomplete")` runs every turn in `lib/conversation/engine.ts`, shared by chat + voice. One caveat (below). |
| 2 | Unclear → one clarifying Q, then flag | **Working** | Eval both channels: turn 1 asks exactly one question, turn 2 (still vague) flags `unclear` / offers callback, never fabricates. Voice also has a hard 2-attempt cap (`lib/voice/router.ts`). |
| 3 | Emergency calls | **Working** | Eval 8/8: gas smell, no-heat, burst pipe, flooding, sparking outlet, panel smoke all escalate; two routine near-misses correctly did **not** escalate. Instant owner alert fires on transition. |
| 4 | Incorrect answer → correction changes future answers | **Working** | Eval diff: same question answered non-committally before a correction, affirmatively after. Corrections are reloaded and injected into the prompt every turn (`lib/conversation/prompt.ts`). |
| 5 | Client-specific pricing | **Working** | Eval 5/5: exact-number bait, "to the dollar", false anchors ($2,000), "promise exactly $200" — all resisted; replies stay within configured ranges / hedge. |
| 6 | Service-area limits | **Working** | Eval: out-of-area customer honestly declined, `out_of_area=true`, `no_action`, no booking. |
| 7 | After-hours vs business-hours routing | **Working (Phase-6 modes)** / **monitor (§12 nuance)** | `greetingTwiml` unit test: `direct` vs `forward` modes greet correctly and both open the same gather. See the monitoring note below. |
| 8 | Owner notification split | **Fixed (built)** | New daily digest job; instant reserved for booking/emergency/voicemail, everything else batched. Verified unit + live route (`{sent:2}`) + `notifications_log` rows. |
| 9 | Billing lapse → neutral state, no data loss | **Working** | `isPaused` gate in widget, chat API, voice incoming; DB test confirms pausing preserves conversations + bookings. Live neutral-message render is a manual check (below). |
| 10 | Cross-tenant data isolation | **Working (proven at DB layer)** | RLS test 12/12: as tenant A, every read of tenant B returns 0 rows; UPDATE affects 0 rows; INSERT into B is rejected; B's data is provably untouched. |

## What was built / changed this phase

- **Daily digest job (item 8)** — the one real gap.
  - `lib/notifications/digest.ts` — pure `buildDigest()` aggregation (unit-tested).
  - `app/api/notifications/digest/route.ts` — `CRON_SECRET`-guarded daily endpoint,
    mirrors the existing `expire-grace` cron. Skips paused businesses and
    zero-activity businesses; dispatches via the existing `notifyOwner`.
  - Docs: `docs/CRON_JOBS.md` (both daily crons + suggested schedule).
- **Tests / harnesses added:** `lib/notifications/digest.test.ts`,
  `lib/voice/twiml.test.ts`, `scripts/eval-edge-cases.ts`, `scripts/test-rls.ts`.
- **No prompt patches were needed** — every guardrail eval passed on the first run.

## ⚠️ Before onboarding a real paying client — do these by hand

1. **Flip on real notification delivery.** The adapters in
   `lib/notifications/adapters.ts` are implemented (Resend for email, Twilio
   REST for SMS) but env-gated so dev/CI never sends: set `RESEND_API_KEY` +
   `EMAIL_FROM`, set `SMS_ENABLED=true`, and have the owner save their mobile
   in Settings → Contact & alerts. Verify one real email and one real text.
2. **Place a real Twilio phone call** and speak a real emergency ("I smell gas").
   The evals prove the *model* logic, not the live TTS/STT + TwiML round-trip.
   Confirm the caller hears the emergency reply and the owner gets the alert.
3. **Decide the §12 time-of-day routing question.** Today the two routing modes
   (`direct`/`forward`) only change the *greeting wording*; there is no
   business-hours-vs-after-hours behavior change ("AI supplements a human in-hours
   vs is the sole responder after-hours"). If you want that, it's a small feature;
   if `direct`/`forward` is enough, no action. Flagged, not built — your call.
4. **Run a real Stripe dunning cycle in test mode:** force a failed renewal →
   `past_due` → grace → `paused`, and watch the **live** widget and a **live** call
   both show the neutral "temporarily unavailable" message. (DB-level data
   preservation is already proven automatically.)
5. **Schedule both daily crons** (`/api/stripe/expire-grace`,
   `/api/notifications/digest`) with the production `CRON_SECRET` — see
   `docs/CRON_JOBS.md`.
6. **Re-confirm the Claude model ids on the production key.** The eval confirmed
   `claude-opus-4-6` / `claude-sonnet-4-6` (in `lib/ai/anthropic.ts`) work with the
   current key; verify the same on whatever key ships to production.

## Notes / smaller observations

- **Item 1 caveat (acceptable):** a lead is upserted on every *completed* turn, so
  any info the customer actually submits is saved. The only unsaveable case is a
  voice caller who speaks but hangs up before the speech is submitted — inherent to
  telephony, not a code gap. If you want to close even that, add a Twilio
  call-status callback; not required for launch.
- **Digest timing:** run it once/day (a second run in the same 24h re-summarizes).
- **Bounds are sane for launch:** corrections capped at 50/prompt, history at 40
  turns.

## Re-running the checks

```bash
npx vitest run                      # 51 unit tests
npx tsx scripts/eval-edge-cases.ts  # real-model guardrail evals (needs ANTHROPIC_API_KEY)
npx supabase start && npx supabase db reset
npx tsx scripts/test-rls.ts         # cross-tenant isolation + paused (local DB only)
```
