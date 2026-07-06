-- Phase 4 — dashboard settings fields the earlier schema didn't need yet.
--
-- Two new per-business config values, both owned/edited by the owner from the
-- dashboard Settings page (design §11 keeps all per-client config as data on the
-- one businesses row — never per-client code):
--
--   * average_job_value_cents — a single typical job value the owner enters. The
--     dashboard multiplies it by this week's bookings to show "revenue potential
--     captured" (design §13: every number ties back to money). Null until set, so
--     the dashboard can prompt the owner to fill it in rather than show a fake $0.
--
--   * notification_preferences — which channels (SMS/email) to alert on and
--     whether to receive the daily activity digest. The instant-for-bookings/
--     emergencies vs digest-for-general policy (design §12) is fixed product
--     behavior; only the channel choice and digest opt-in are stored here.
--
-- No RLS changes needed: the existing businesses_update policy already lets the
-- owner update their own row, and these are just new columns on it.

alter table businesses
  add column average_job_value_cents integer,
  add column notification_preferences jsonb not null
    default '{"channels": ["sms"], "daily_digest": true}'::jsonb;
