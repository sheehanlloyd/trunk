-- Phase 1 — Row Level Security. This is the core multi-tenant guarantee:
-- a logged-in user can only ever read/write rows tied to their own business_id.

-- ---------------------------------------------------------------------------
-- current_business_id(): resolves the caller's business_id from auth.uid().
--
-- SECURITY DEFINER so that querying business_users here bypasses RLS on that
-- table. Without this, the RLS policy ON business_users would call this
-- function, which would re-query business_users under RLS -> infinite
-- recursion. Defining it as SECURITY DEFINER breaks that cycle.
-- ---------------------------------------------------------------------------
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.business_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_business_id() from public;
grant execute on function public.current_business_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every tenant table. With RLS enabled and no permissive
-- policy match, access is denied by default. The service_role key bypasses
-- RLS entirely (used later by public chat/voice/Stripe webhook endpoints,
-- which scope by business_id in application code).
-- ---------------------------------------------------------------------------
alter table businesses            enable row level security;
alter table business_users        enable row level security;
alter table conversations         enable row level security;
alter table bookings              enable row level security;
alter table knowledge_corrections enable row level security;
alter table notifications_log     enable row level security;

-- ---------------------------------------------------------------------------
-- businesses: caller may access only their own business row.
-- ---------------------------------------------------------------------------
create policy "businesses_select" on businesses
  for select to authenticated
  using (id = public.current_business_id());

create policy "businesses_update" on businesses
  for update to authenticated
  using (id = public.current_business_id())
  with check (id = public.current_business_id());

-- ---------------------------------------------------------------------------
-- business_users: caller may see memberships within their own business.
-- (Safe from recursion because current_business_id() is SECURITY DEFINER.)
-- ---------------------------------------------------------------------------
create policy "business_users_select" on business_users
  for select to authenticated
  using (business_id = public.current_business_id());

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create policy "conversations_select" on conversations
  for select to authenticated
  using (business_id = public.current_business_id());

create policy "conversations_insert" on conversations
  for insert to authenticated
  with check (business_id = public.current_business_id());

create policy "conversations_update" on conversations
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create policy "bookings_select" on bookings
  for select to authenticated
  using (business_id = public.current_business_id());

create policy "bookings_insert" on bookings
  for insert to authenticated
  with check (business_id = public.current_business_id());

create policy "bookings_update" on bookings
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

-- ---------------------------------------------------------------------------
-- knowledge_corrections: owner/staff submit corrections. Insert additionally
-- requires created_by to be a membership within the caller's business.
-- ---------------------------------------------------------------------------
create policy "knowledge_corrections_select" on knowledge_corrections
  for select to authenticated
  using (business_id = public.current_business_id());

create policy "knowledge_corrections_insert" on knowledge_corrections
  for insert to authenticated
  with check (
    business_id = public.current_business_id()
    and (
      created_by is null
      or created_by in (
        select id from public.business_users
        where business_id = public.current_business_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- notifications_log: read-only from the dashboard (writes happen server-side
-- via the service role in later phases).
-- ---------------------------------------------------------------------------
create policy "notifications_log_select" on notifications_log
  for select to authenticated
  using (business_id = public.current_business_id());
