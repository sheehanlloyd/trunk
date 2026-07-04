-- Phase 1 — Initial schema for the AI Receptionist multi-tenant platform.
-- Implements DESIGN.md section 3 exactly. All tenant data is keyed by business_id.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type business_status as enum ('trial', 'active', 'past_due', 'paused', 'canceled');
create type user_role as enum ('owner', 'staff');
create type conversation_channel as enum ('chat', 'voice');
create type conversation_outcome as enum ('booked', 'no_action', 'unclear', 'emergency_escalated', 'voicemail_left');
create type booking_status as enum ('new', 'confirmed', 'owner_contacted', 'canceled');
create type notification_type as enum ('sms', 'email');
create type notification_status as enum ('sent', 'failed');

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table businesses (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  owner_email          text not null,
  phone_number         text,                    -- Twilio-assigned
  service_area         text,                    -- text or geo radius
  services             jsonb not null default '[]'::jsonb, -- [{service, description, price_range}]
  hours                jsonb not null default '{}'::jsonb,
  emergency_policy     text,                    -- how to handle after-hours emergencies
  raw_scraped_content  text,                    -- original scrape, for reference/re-training
  status               business_status not null default 'trial',
  stripe_customer_id   text,
  stripe_subscription_id text,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- business_users  (maps Supabase auth users to a business + role)
-- ---------------------------------------------------------------------------
create table business_users (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  email         text not null,
  role          user_role not null default 'owner',
  auth_user_id  uuid references auth.users (id) on delete set null, -- null until invite accepted
  created_at    timestamptz not null default now()
);

-- One membership per email per business; one auth user maps to one membership.
create unique index business_users_business_email_key on business_users (business_id, email);
create unique index business_users_auth_user_id_key on business_users (auth_user_id) where auth_user_id is not null;
create index business_users_business_id_idx on business_users (business_id);
create index business_users_email_idx on business_users (lower(email));

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table conversations (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses (id) on delete cascade,
  channel            conversation_channel not null,
  customer_name      text,
  customer_phone     text,
  transcript         jsonb not null default '[]'::jsonb, -- array of turns
  outcome            conversation_outcome,
  ai_confidence_flag boolean not null default false,     -- AI unsure, needs owner review
  created_at         timestamptz not null default now()
);

create index conversations_business_id_idx on conversations (business_id);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table bookings (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references conversations (id) on delete set null,
  business_id       uuid not null references businesses (id) on delete cascade,
  customer_name     text,
  customer_phone    text,
  requested_service text,
  preferred_time    text,
  notes             text,
  status            booking_status not null default 'new',
  created_at        timestamptz not null default now()
);

create index bookings_business_id_idx on bookings (business_id);
create index bookings_conversation_id_idx on bookings (conversation_id);

-- ---------------------------------------------------------------------------
-- knowledge_corrections
-- ---------------------------------------------------------------------------
create table knowledge_corrections (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses (id) on delete cascade,
  original_content   text,
  corrected_content  text,
  created_by         uuid references business_users (id) on delete set null,
  created_at         timestamptz not null default now()
);

create index knowledge_corrections_business_id_idx on knowledge_corrections (business_id);

-- ---------------------------------------------------------------------------
-- notifications_log
-- ---------------------------------------------------------------------------
create table notifications_log (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses (id) on delete cascade,
  type               notification_type not null,
  related_booking_id uuid references bookings (id) on delete set null,
  status             notification_status not null,
  created_at         timestamptz not null default now()
);

create index notifications_log_business_id_idx on notifications_log (business_id);
