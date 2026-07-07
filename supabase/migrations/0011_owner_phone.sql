-- Audit fix (item 2): real notification delivery needs somewhere to actually
-- send an SMS. The "sms" channel previously faked a "sent" status against the
-- owner's EMAIL address (there was no phone number on file at all) — this
-- column is what the dashboard Settings → Notifications field now collects,
-- and what lib/notifications/send.ts uses for real Twilio SMS dispatch.
--
-- Nullable: many businesses won't have set this yet. lib/notifications/send.ts
-- falls back to email (and logs that fallback truthfully) rather than
-- pretending an SMS went out with nowhere to send it.
--
-- No RLS changes needed: the existing businesses_update policy already lets
-- the owner update their own row, and this is just a new column on it.

alter table businesses
  add column owner_phone text;
