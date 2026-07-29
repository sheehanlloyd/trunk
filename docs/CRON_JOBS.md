# Scheduled jobs (cron)

The platform has three scheduled endpoints. All are plain HTTP POSTs guarded by
a shared secret, so any scheduler works (Vercel Cron, a Supabase scheduled
function, GitHub Actions, or an external cron hitting the deployed URL).

Set `CRON_SECRET` to a strong random string and send it on every call:

```
Authorization: Bearer <CRON_SECRET>
```

A missing/wrong secret returns `401`.

| Endpoint | Cadence | Purpose |
|----------|---------|---------|
| `POST /api/stripe/expire-grace` | daily | Billing §10: move `past_due` businesses whose grace window elapsed to `paused`. |
| `POST /api/notifications/digest` | daily | Design §12: send each opted-in business one daily activity summary. |
| `POST /api/insights/weekly` | weekly | Generate a fresh AI insights report for every serving business. |

## Weekly AI insights — `POST /api/insights/weekly`

Insights used to exist only behind the "Generate insights" button on the
analytics page, which meant the owners who never found the button never got a
report. This job generates one on a schedule so the report is simply waiting for
them.

Behavior:

- Only businesses with status `trial`, `active`, or `past_due` are considered —
  a `paused` or `canceled` line isn't serving customers, so it gets no report.
- A business whose newest report is younger than **6 days** is skipped. Six
  rather than seven because schedulers drift; a 7-day threshold would make every
  other week's run silently skip the tenant it was meant to serve. This also
  makes the job safe to re-run: a double-fire costs nothing in tokens.
- Businesses with fewer than 5 conversations in the last 30 days are skipped —
  there is nothing worth paying a model to summarize.
- Each run is bounded: at most **12** businesses, **4** at a time. The response
  includes `remaining` (and the server logs a warning) when the cap truncates a
  sweep, so a partial run is visible rather than looking complete. If you
  regularly see `remaining > 0`, run the job more often — the 6-day skip means
  extra runs are nearly free.

Response shape:

```json
{ "generated": 3, "skippedRecent": 8, "skippedNoData": 1, "failed": 0, "remaining": 0 }
```

One tenant's failure never fails the sweep; failures are counted and logged with
the business name.

Suggested cadence: Monday early morning, so the report reflects a full week and
is waiting when owners check in.

## Daily activity digest — `POST /api/notifications/digest`

Design §12 ("Owner notification fatigue") splits owner alerts:

- **Instant** (fired live by the conversation engine / voice handlers, no cron):
  bookings, emergencies, and voicemails. These interrupt the owner because they
  are time-sensitive money.
- **Batched** (this job): everything else — general questions answered and leads
  that need a human follow-up — rolled into one summary per day so the owner
  isn't pinged per conversation.

Behavior:

- Only businesses with `notification_preferences.daily_digest = true` are
  included. Owners toggle this on the dashboard Settings → Notifications form.
- A business that is **paused** (or past its grace window) is skipped — a paused
  line isn't serving customers, so it gets no digest.
- If a business had **zero** activity in the last 24h, its digest is skipped
  entirely (no "you had 0 conversations" noise).
- Bookings/emergencies/voicemails appear in the digest as **totals only** — they
  were already alerted instantly and are never re-notified individually.
- Each send is dispatched via `notifyOwner` on the owner's chosen channels and
  recorded in `notifications_log` with `reason = "digest"`.

Response: `{ "sent": n, "skipped": n, "checked": n }`.

Schedule it **once** per day — a second run in the same 24h window would
re-summarize the same activity. A morning slot (e.g. 8am in the business's region)
reads best as "yesterday's summary."

### Suggested Vercel Cron entry

```json
{
  "crons": [
    { "path": "/api/stripe/expire-grace", "schedule": "0 9 * * *" },
    { "path": "/api/notifications/digest", "schedule": "0 13 * * *" }
  ]
}
```

(Vercel Cron sends the secret via a configured header; for other schedulers add
the `Authorization: Bearer <CRON_SECRET>` header yourself.)

## Note: notification delivery is opt-in

The digest (like every other alert) goes through `lib/notifications/adapters.ts`.
Delivery is real but gated by env: email sends via Resend once `RESEND_API_KEY`
(+ `EMAIL_FROM`) is set, and SMS sends via Twilio once `SMS_ENABLED=true` and the
owner has a mobile number saved in Settings. With neither configured, adapters
log to the server console — everything is still wired and recorded in
`notifications_log`, but nothing leaves the box. See `docs/STRIPE_GOLIVE.md` §7.
