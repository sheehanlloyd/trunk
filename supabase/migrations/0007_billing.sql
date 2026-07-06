-- Phase 5 — Stripe billing.
--
-- Design §10: a $500 setup fee + $199/mo subscription created together, with
-- webhook-driven status transitions and a grace period before service pauses.
-- Billing NEVER destroys data — only businesses.status changes. This migration
-- adds the small amount of state that supports that:
--
--   * businesses.grace_period_ends_at — when a renewal fails we move to
--     `past_due` and set this to now + grace days. Service keeps running until
--     it passes; a daily sweep (or the lazy widget/chat gate) then moves the
--     business to `paused`. Null whenever not in a grace window.
--
--   * notifications_log.reason — labels a logged alert (e.g. 'billing_past_due',
--     'billing_paused') so billing notifications are distinguishable from the
--     booking/emergency alerts the table already records.
--
--   * stripe_webhook_events — the idempotency ledger. Stripe re-sends events;
--     we insert the event id here first (primary key) and skip anything already
--     present, so duplicate deliveries never double-process. Written only by the
--     service role from the webhook handler; RLS on, no authenticated policy.
--
-- Base-table grants are covered by the default privileges set in 0005_grants.sql,
-- so new tables need no explicit GRANT here — only RLS.

alter table businesses
  add column grace_period_ends_at timestamptz;

alter table notifications_log
  add column reason text;

create table stripe_webhook_events (
  stripe_event_id text primary key,          -- Stripe's event.id — the idempotency key
  type            text not null,             -- e.g. 'invoice.payment_failed'
  business_id     uuid references businesses (id) on delete set null,
  processed_at    timestamptz,               -- set once the handler finishes
  created_at      timestamptz not null default now()
);

create index stripe_webhook_events_business_id_idx
  on stripe_webhook_events (business_id);

-- Service-role only: the webhook handler writes/reads it; tenants never do.
alter table stripe_webhook_events enable row level security;
