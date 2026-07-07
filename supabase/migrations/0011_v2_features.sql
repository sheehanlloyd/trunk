-- V2 feature layer — the schema for everything the dashboard grew in this pass:
-- real SMS delivery, widget customization, review requests, lead recovery,
-- conversation summaries, and AI insights.
--
--   * businesses.owner_phone — the SMS destination that Phase 5's notification
--     stubs never had. Owner-editable from Settings; SMS silently falls back to
--     email while it's null, so enabling real SMS is data entry, not a deploy.
--
--   * businesses.review_link — the business's public review URL (usually their
--     Google review link). Powers one-tap "text a review request" on bookings
--     the owner has already handled. Null hides the feature entirely.
--
--   * businesses.widget_config — owner-tunable widget appearance
--     ({accent_color, greeting, position}). Defaults to {} = the stock look, so
--     every existing tenant renders exactly as before. Read by the public
--     widget frame; validated in the settings action before write.
--
--   * conversations.summary — a stored one-paragraph AI summary, generated
--     on demand from the transcript view and shown in the list. Null until an
--     owner asks for one; never blocks the live conversation path.
--
--   * leads.resolved_at — lets the owner clear recovered/dead leads out of the
--     new Leads page without deleting the record (the digest and analytics
--     still count them). Needs the leads UPDATE policy added below — 0004
--     shipped select-only because no UI wrote to leads back then.
--
--   * insights — one row per generated "AI insights" report: Claude's read of
--     the last 30 days of conversations (top questions, knowledge gaps,
--     suggested corrections) as structured JSON. Written via the service role
--     from a server action after an owner-auth check (same trust model as
--     chat/voice writes); tenants read their own rows under RLS.
--
-- Base-table grants come from 0005's default privileges; only RLS is declared
-- here.

alter table businesses
  add column owner_phone text,
  add column review_link text,
  add column widget_config jsonb not null default '{}'::jsonb;

alter table conversations
  add column summary text;

alter table leads
  add column resolved_at timestamptz;

-- Owners can now resolve/reopen their own leads from the dashboard.
create policy "leads_update" on leads
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

-- ---------------------------------------------------------------------------
-- insights
-- ---------------------------------------------------------------------------
create table insights (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id) on delete cascade,
  period_start timestamptz not null,
  period_end   timestamptz not null,
  content      jsonb not null,  -- {headline, top_questions[], gaps[], suggested_corrections[], stats{}}
  created_at   timestamptz not null default now()
);

create index insights_business_id_created_at_idx
  on insights (business_id, created_at desc);

alter table insights enable row level security;

-- Read-only for tenants, mirroring leads: rows are written server-side by the
-- service role (scoped by business_id in the action), never by the browser.
create policy "insights_select" on insights
  for select to authenticated
  using (business_id = public.current_business_id());
