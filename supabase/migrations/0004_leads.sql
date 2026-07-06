-- Phase 3 — leads: partial/abandoned booking capture.
--
-- Design §12 requires that when a customer starts giving booking info but
-- disconnects mid-flow (or is out of area / needs a callback), we DON'T discard
-- what we collected. A lead holds that partial info, linked to its conversation.
--
-- One lead per conversation (unique index): the conversation engine upserts the
-- lead as info accrues, and deletes it if the booking is completed (the lead
-- "converts" into a bookings row). Writes happen via the service role from the
-- unauthenticated chat/voice handlers; the dashboard reads them under RLS.

create table leads (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses (id) on delete cascade,
  conversation_id   uuid references conversations (id) on delete set null,
  customer_name     text,
  customer_phone    text,
  requested_service text,
  preferred_time    text,
  notes             text,
  reason            text,   -- 'incomplete' | 'out_of_area' | 'needs_callback'
  created_at        timestamptz not null default now()
);

-- At most one lead per conversation so upserts replace rather than duplicate.
create unique index leads_conversation_id_key on leads (conversation_id);
create index leads_business_id_idx on leads (business_id);

-- ---------------------------------------------------------------------------
-- RLS: mirrors bookings/conversations. The dashboard (authenticated) may read
-- only its own business's leads; inserts/updates come from the service role,
-- which bypasses RLS and scopes by business_id in application code.
-- ---------------------------------------------------------------------------
alter table leads enable row level security;

create policy "leads_select" on leads
  for select to authenticated
  using (business_id = public.current_business_id());
