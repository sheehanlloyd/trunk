# Voice / phone calls setup

How the AI receptionist answers phone calls (design §8), and what you must
configure for it to work in production.

## How it works

1. A call rings the client's **Twilio number**. Twilio POSTs to
   `/api/voice/incoming`, which resolves the business by the dialed number,
   greets the caller by name (Amazon Polly TTS), and opens a speech gather.
2. The caller speaks; Twilio speech-to-text posts the transcript to
   `/api/voice/gather`, which runs it through the **same** `handleTurn` engine as
   chat (`channel: "voice"`) — same business context, same booking capture.
3. Replies are spoken back. Bookings and emergencies fire instant owner alerts.
4. After 2 turns the AI can't understand (no speech or still unclear), it falls
   back to a **voicemail** (`/api/voice/recording`) saved as a conversation with
   `outcome = voicemail_left`.

The voice system prompt differs from chat in exactly one place — the "Channel"
block in `lib/conversation/prompt.ts` (short spoken sentences, one question at a
time, read phone numbers back digit-by-digit, ask-to-repeat on garble except in
an emergency). Voice turns also use a faster model (`VOICE_CLAUDE_MODEL`) and a
smaller token budget to keep call latency down.

## Two routing modes (both supported, same webhook)

Set `businesses.call_routing_mode`:

- **`direct`** (default) — the AI is the only responder. The client publishes the
  provisioned Twilio number; every call reaches the receptionist immediately.
- **`forward`** — the client keeps their existing published number and sets their
  carrier / phone system to **forward on no-answer after N rings** to the Twilio
  number. Unanswered calls then reach the AI. Only the spoken greeting differs.

Both modes ring the Twilio number, so `/api/voice/incoming` handles both — the
mode only tunes greeting wording.

## Production configuration

1. **Twilio credentials** — set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_PHONE_NUMBER`. Onboarding provisions each client a number and points
   its **Voice webhook** at `https://<domain>/api/voice/incoming` (POST)
   automatically (`lib/twilio/client.ts`).
2. **Public URL** — set `NEXT_PUBLIC_APP_URL` to your public HTTPS domain so
   Twilio can reach the webhooks and so the `action`/callback URLs are correct.
   Twilio cannot reach `localhost`; for local end-to-end calls use a tunnel
   (e.g. `ngrok`) and set the number's Voice webhook to the tunnel URL.
3. **Signature validation** — set `TWILIO_VALIDATE_SIGNATURE=true`. The voice
   endpoints verify `X-Twilio-Signature` so only Twilio can invoke them (they
   trigger owner notifications). Leave unset/false only for local testing.
4. **Voice model** — optionally set `VOICE_CLAUDE_MODEL` to the exact fast model
   id enabled for your Anthropic account (defaults to a Sonnet-class model).

## Latency (candid)

Each turn's perceived gap ≈ speech end-detection (~1s of trailing silence) + the
Claude structured-output call (the dominant cost) + Polly synthesis (fast).
Expect ~2–4s between the caller finishing and hearing a reply — noticeable but
usable. Mitigations in place: faster voice model, 256-token cap, concise prompt.
This is request/response TwiML, not streaming; the future upgrade is Twilio Media
Streams + a realtime model. Speech-to-text accuracy on names, phone numbers, and
addresses is the biggest quality risk — the prompt reads numbers back to confirm,
but this and emergency sensitivity, the 2-attempt threshold, and `speechTimeout`
are the parts most likely to need tuning once real calls come in.
