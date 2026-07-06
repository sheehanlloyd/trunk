-- Phase 1 — Local seed data for testing invite flow + RLS isolation.
--
-- Two independent tenants, each with an invited owner (auth_user_id = null).
-- To test:
--   1. Visit /accept-invite and set a password for owner@coolbreeze.test
--      -> the auth trigger links you to Cool Breeze HVAC.
--   2. Confirm the dashboard only ever shows Cool Breeze data, never
--      Rapid Response Plumbing data (proves tenant isolation via RLS).

insert into businesses (id, name, owner_email, phone_number, service_area, services, hours, emergency_policy, average_job_value_cents, status)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Cool Breeze HVAC',
    'owner@coolbreeze.test',
    '+15550100001',
    'Austin, TX (25 mi radius)',
    '[{"service":"AC Repair","description":"Diagnostics and repair for central AC","price_range":"$150-$600"},{"service":"Furnace Tune-Up","description":"Seasonal heating maintenance","price_range":"$99-$250"}]'::jsonb,
    '{"mon":"8-6","tue":"8-6","wed":"8-6","thu":"8-6","fri":"8-6","sat":"9-2","sun":"closed"}'::jsonb,
    'After hours: text the on-call tech line; no-heat below 40F is treated as an emergency callback within 15 minutes.',
    35000,
    'active'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Rapid Response Plumbing',
    'owner@rapidplumb.test',
    '+15550100002',
    'Dallas, TX (30 mi radius)',
    '[{"service":"Drain Cleaning","description":"Clogged drains and hydro jetting","price_range":"$120-$400"},{"service":"Water Heater Install","description":"Tank and tankless installation","price_range":"$900-$3000"}]'::jsonb,
    '{"mon":"7-7","tue":"7-7","wed":"7-7","thu":"7-7","fri":"7-7","sat":"8-4","sun":"emergency only"}'::jsonb,
    'Active leak or flooding is an emergency: instruct caller to shut off main and we call back immediately.',
    120000,
    'trial'
  );

insert into business_users (business_id, email, role, auth_user_id)
values
  ('11111111-1111-1111-1111-111111111111', 'owner@coolbreeze.test', 'owner', null),
  ('22222222-2222-2222-2222-222222222222', 'owner@rapidplumb.test', 'owner', null);

-- A couple of sample rows per tenant so dashboards aren't empty during testing.
insert into conversations (business_id, channel, customer_name, customer_phone, transcript, outcome, ai_confidence_flag)
values
  ('11111111-1111-1111-1111-111111111111', 'chat', 'Dana Rivera', '+15551230001',
   '[{"role":"customer","text":"My AC stopped cooling"},{"role":"assistant","text":"I can get a tech out. What is your address?"}]'::jsonb,
   'booked', false),
  ('11111111-1111-1111-1111-111111111111', 'voice', 'Sam Lee', '+15551230002',
   '[{"role":"customer","text":"Do you service Round Rock?"}]'::jsonb,
   'no_action', true),
  ('22222222-2222-2222-2222-222222222222', 'chat', 'Priya Shah', '+15551240001',
   '[{"role":"customer","text":"Water heater is leaking"}]'::jsonb,
   'emergency_escalated', false);

insert into bookings (business_id, conversation_id, customer_name, customer_phone, requested_service, preferred_time, status)
select business_id, id, customer_name, customer_phone, 'AC Repair', 'Tomorrow morning', 'new'
from conversations
where business_id = '11111111-1111-1111-1111-111111111111' and outcome = 'booked';
