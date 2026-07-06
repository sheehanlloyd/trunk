-- Base schema/table privileges for the standard Supabase roles.
--
-- Discovered while verifying Phase 3 end-to-end: `service_role` has BYPASS RLS
-- (so RLS policies don't apply to it) but Postgres still enforces a base table
-- GRANT independently of RLS, and none existed for any table in `public` —
-- only TRUNCATE/REFERENCES/TRIGGER were present for anon/authenticated/
-- service_role. That blocked every read/write (dashboard queries under RLS,
-- and the service-role chat/onboarding writes), not just this phase's tables.
-- Normally a fresh Supabase project's default init grants this once; it was
-- missing here, so it's made explicit and forward-looking (future tables too).
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
