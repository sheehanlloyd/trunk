-- V3 query-path indexes. The v2/v3 dashboard grew several hot read paths that
-- 0001/0009's single-column and conversations-only composites don't cover:
--
--   * bookings list + calendar week ranges + weekly report both order/range on
--     (business_id, created_at) — the old (business_id) index makes Postgres
--     re-sort every page load once a tenant has real volume.
--   * the Leads page's default view is "open leads, newest first"; the partial
--     index keeps that count+list cheap no matter how much resolved history
--     accumulates (resolved rows never leave the table by design).
--   * the Activity page reads notifications_log newest-first and counts the
--     last 7 days on every visit.
--   * the conversations outcome filter chips and the dashboard's emergency
--     banner both select by (business_id, outcome).
--
-- All idempotent so the migration is safe to re-run against a database that
-- picked any of these up out of band.

create index if not exists bookings_business_id_created_at_idx
  on bookings (business_id, created_at desc);

create index if not exists leads_business_id_created_at_idx
  on leads (business_id, created_at desc);

create index if not exists leads_open_by_business_idx
  on leads (business_id, created_at desc)
  where resolved_at is null;

create index if not exists notifications_log_business_id_created_at_idx
  on notifications_log (business_id, created_at desc);

create index if not exists conversations_business_id_outcome_idx
  on conversations (business_id, outcome);
