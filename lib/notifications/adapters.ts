/**
 * Channel adapters for owner notifications.
 *
 * Both adapters are real now, with a deliberate dev fallback: when a provider
 * isn't configured (no RESEND_API_KEY / SMS_ENABLED unset) they log a masked
 * line and report success, exactly like the Phase 5 stubs did. That keeps local
 * dev, CI, and fresh checkouts working with zero provider accounts while
 * production only needs env vars — no code change to go live. Every attempt is
 * still recorded in `notifications_log` by the caller (lib/notifications/send.ts).
 */

import { emailConfig, serverEnv, smsEnabled } from "@/lib/env";

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

/** True = handed off to the channel; false = failed (recorded as such). */
export async function dispatchEmail(msg: EmailMessage): Promise<boolean> {
  const config = emailConfig();
  if (!config) {
    // Dev fallback — no provider configured. Never log the full recipient or
    // body; both can carry customer PII (phone numbers, names).
    console.info(
      `[notify:email] dev send → ${maskRecipient(msg.to)} (subject_len=${msg.subject.length}, body_len=${msg.body.length})`,
    );
    return true;
  }

  try {
    // Resend's REST API is a single POST; the fetch keeps us dependency-free.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.body,
      }),
    });
    if (!res.ok) {
      console.error(
        `[notify:email] provider rejected send → ${maskRecipient(msg.to)} (status=${res.status})`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notify:email] send failed → ${maskRecipient(msg.to)}`, err);
    return false;
  }
}

export async function dispatchSms(msg: SmsMessage): Promise<boolean> {
  if (!smsEnabled()) {
    console.info(
      `[notify:sms] dev send → ${maskRecipient(msg.to)} (body_len=${msg.body.length})`,
    );
    return true;
  }

  try {
    const { accountSid, authToken, phoneNumber } = serverEnv.twilio;
    // Twilio REST directly rather than the SDK: this is one form-encoded POST,
    // and keeping it raw avoids loading the (heavy) client on the alert path.
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: phoneNumber,
          To: msg.to,
          Body: msg.body,
        }),
      },
    );
    if (!res.ok) {
      console.error(
        `[notify:sms] provider rejected send → ${maskRecipient(msg.to)} (status=${res.status})`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notify:sms] send failed → ${maskRecipient(msg.to)}`, err);
    return false;
  }
}
