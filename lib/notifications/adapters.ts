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

/** True = handed off to the channel; false = failed (recorded as such). */
export async function dispatchEmail(msg: EmailMessage): Promise<boolean> {
  // DROP-IN: send via Resend/SendGrid here, e.g.
  //   await resend.emails.send({ from, to: msg.to, subject: msg.subject, text: msg.body })
  // Return false (or throw) on provider failure so it's logged as `failed`.
  console.info(`[notify:email] → ${msg.to} :: ${msg.subject}\n${msg.body}`);
  return true;
}

export async function dispatchSms(msg: SmsMessage): Promise<boolean> {
  // DROP-IN: send via Twilio REST (serverEnv.twilio is already configured):
  //   POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
  //   Basic auth {sid}:{authToken}, body: { From: twilio.phoneNumber, To: msg.to, Body: msg.body }
  // Requires an owner mobile number (add an `owner_phone` column + Settings field).
  console.info(`[notify:sms] → ${msg.to}\n${msg.body}`);
  return true;
}
