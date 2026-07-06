-- Phase 6 — Voice / phone calls.
--
-- The voice transport (Twilio webhooks, TTS/STT) reuses the existing context
-- engine and booking module, so almost nothing new is needed in the schema. The
-- one addition is how a business's calls reach the AI (design §8, step 1):
--
--   * call_routing_mode:
--       'direct'  — the AI is the only responder; customers dial the assigned
--                   Twilio number and reach the receptionist straight away.
--       'forward' — the client keeps their existing published number and
--                   forwards it to the Twilio number after N unanswered rings.
--
--     Both modes hit the same /api/voice/incoming webhook (both ring the Twilio
--     number); this flag only tailors the spoken greeting and records how the
--     client is set up. Defaults to 'direct'.
--
-- The `voicemail_left` conversation outcome (design §8, step 6) already exists in
-- the conversation_outcome enum from 0001, so no enum change is needed here.

alter table businesses
  add column call_routing_mode text not null default 'direct';
