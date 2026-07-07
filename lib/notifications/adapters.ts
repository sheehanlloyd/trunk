import { notificationFromEmail, serverEnv } from "@/lib/env";

/**
 * Channel adapters for owner notifications (audit fix, item 2).
 *
 * Real delivery: email via Resend, SMS via the Twilio REST API (using the
 * same Twilio credentials already configured for voice — `serverEnv.twilio`).
 * Every attempt is recorded in `notifications_log` by the caller
 * (lib/notifications/send.ts); these adapters only report true/false and log
 * a masked recipient, never the full address/number or message body (both can
 * carry customer or owner PII).
 *
 * Both providers' SDK/API clients are created lazily so the app boots fine
 * before `RESEND_API_KEY` / Twilio env vars are set — a feature that never
 * sends a notification (e.g. local dev, or this key genuinely unset) doesn't
 * block anything else from running. Without live credentials both functions
 * fail closed (return false, logged) rather than throwing into the caller.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * Masks a recipient identifier for logging: keeps enough to recognize which
 * recipient a log line refers to during debugging without writing the full
 * address/number (which is customer or owner PII) to server logs.
 */
function maskRecipient(to: string): string {
  const at = to.indexOf("@");
  if (at > 0) {
    // email: keep first char + domain, e.g. "o***@example.com"
    return `${to[0]}***@${to.slice(at + 1)}`;
  }
  // phone-like: keep the last 4 digits, e.g. "***1234"
  const digits = to.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
}

// Lazily constructed and memoized per server process, same pattern as
// lib/stripe/client.ts / lib/ai/anthropic.ts.
let resendClient: import("resend").Resend | null = null;
async function getResend(): Promise<import("resend").Resend> {
  if (!resendClient) {
    const { Resend } = await import("resend");
    resendClient = new Resend(serverEnv.resendApiKey);
  }
  return resendClient;
}

/** True = handed off to the channel; false = failed (recorded as such). */
export async function dispatchEmail(msg: EmailMessage): Promise<boolean> {
  try {
    const resend = await getResend();
    const { error } = await resend.emails.send({
      from: notificationFromEmail(),
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    if (error) {
      // Resend's error object is a safe {name, message} shape — no recipient
      // or body echoed back — but log only its message for consistency with
      // every other adapter/route in this codebase.
      console.error(`[notify:email] send failed → ${maskRecipient(msg.to)}`, error.message);
      return false;
    }
    console.info(
      `[notify:email] sent → ${maskRecipient(msg.to)} (subject_len=${msg.subject.length}, body_len=${msg.body.length})`,
    );
    return true;
  } catch (err) {
    console.error(
      `[notify:email] send threw → ${maskRecipient(msg.to)}`,
      err instanceof Error ? err.message : "unknown error",
    );
    return false;
  }
}

export async function dispatchSms(msg: SmsMessage): Promise<boolean> {
  try {
    const { accountSid, authToken, phoneNumber } = serverEnv.twilio;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: phoneNumber,
          To: msg.to,
          Body: msg.body,
        }).toString(),
      },
    );
    if (!res.ok) {
      // Never log the response body: Twilio error payloads echo back the
      // request, including the destination number and message text.
      console.error(`[notify:sms] send failed → ${maskRecipient(msg.to)} (status=${res.status})`);
      return false;
    }
    console.info(`[notify:sms] sent → ${maskRecipient(msg.to)} (body_len=${msg.body.length})`);
    return true;
  } catch (err) {
    console.error(
      `[notify:sms] send threw → ${maskRecipient(msg.to)}`,
      err instanceof Error ? err.message : "unknown error",
    );
    return false;
  }
}
