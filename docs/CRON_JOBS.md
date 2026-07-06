# Scheduled jobs (cron)

The platform has two scheduled endpoints. Both are plain HTTP POSTs guarded by a
shared secret, so any scheduler works (Vercel Cron, a Supabase scheduled
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

## Note: notification delivery is still stubbed

The digest (like every other alert) goes through `lib/notifications/adapters.ts`,
which currently logs to the server console instead of sending a real email/SMS.
See `docs/STRIPE_GOLIVE.md` §7 for the drop-in to go live. Until then the digest
is fully wired and logged, but nothing leaves the server.
