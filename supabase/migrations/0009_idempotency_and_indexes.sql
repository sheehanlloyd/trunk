-- Phase 7 hardening — webhook idempotency + missing indexes.
--
-- Twilio and Stripe both retry webhook deliveries at least once. Stripe already
-- has an event-id ledger (0007_billing.sql). Twilio had no equivalent: a
-- retried /api/voice/incoming POST created a second `conversations` row for the
-- same call, and a retried /api/voice/gather turn could create a second
-- `bookings` row for the same conversation. This migration adds the two
-- constraints the app now relies on to make both idempotent:
--
--   * conversations.call_sid — Twilio's CallSid, unique per call. A retried
--     /api/voice/incoming POST is now a lookup against this column instead of
--     a blind insert.
--   * bookings.conversation_id — made unique (mirroring leads_conversation_id_key),
--     so createBooking() can upsert instead of blind-insert: a retried turn
--     that tries to create a second booking for the same conversation now
--     resolves to the existing row instead of duplicating it.
--
-- Also adds the (business_id, created_at) and (business_id, status) indexes
-- the dashboard's conversations/bookings list queries filter and sort on,
-- which previously fell back to a business_id-only index scan followed by an
-- in-memory sort as each tenant's history grows.

alter table conversations add column call_sid text;

-- Unique only when present — chat conversations (and any voice conversation
-- created before this migration) have no CallSid.
create unique index conversations_call_sid_key on conversations (call_sid)
  where call_sid is not null;

create index conversations_business_id_created_at_idx
  on conversations (business_id, created_at desc);

-- Replace the non-unique conversation_id index with a unique one: at most one
-- booking per conversation, matching the leads table's pattern.
drop index if exists bookings_conversation_id_idx;

create unique index bookings_conversation_id_key on bookings (conversation_id)
  where conversation_id is not null;

create index bookings_business_id_status_idx on bookings (business_id, status);
