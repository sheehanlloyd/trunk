/**
 * Channel adapters for owner notifications.
 *
 * Phase 5 ships these as **dev stubs**: they log to the server console and report
 * success, and every attempt is recorded in `notifications_log` by the caller
 * (lib/notifications/send.ts). This keeps billing alerts real and testable
 * without pulling in an unconfigured external provider. Going live is a drop-in
 * at the two marked spots — no caller changes needed.
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

/** True = handed off to the channel; false = failed (recorded as such). */
export async function dispatchEmail(msg: EmailMessage): Promise<boolean> {
  // DROP-IN: send via Resend/SendGrid here, e.g.
  //   await resend.emails.send({ from, to: msg.to, subject: msg.subject, text: msg.body })
  // Return false (or throw) on provider failure so it's logged as `failed`.
  // Never log the full recipient or body here — both can carry customer PII
  // (phone numbers, names). Log only enough to recognize the send in dev.
  console.info(
    `[notify:email] dev-stub send → ${maskRecipient(msg.to)} (subject_len=${msg.subject.length}, body_len=${msg.body.length})`,
  );
  return true;
}

export async function dispatchSms(msg: SmsMessage): Promise<boolean> {
  // DROP-IN: send via Twilio REST (serverEnv.twilio is already configured):
  //   POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
  //   Basic auth {sid}:{authToken}, body: { From: twilio.phoneNumber, To: msg.to, Body: msg.body }
  // Requires an owner mobile number (add an `owner_phone` column + Settings field).
  // Never log the full recipient or body — see dispatchEmail.
  console.info(`[notify:sms] dev-stub send → ${maskRecipient(msg.to)} (body_len=${msg.body.length})`);
  return true;
}
