import { isUsablePhone } from "@/lib/booking/capture";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, NotificationType } from "@/lib/types/database";

import { dispatchEmail, dispatchSms } from "./adapters";

/**
 * Owner notification dispatch (design §10/§12). Sends an alert on each channel
 * the owner opted into, and records every attempt in `notifications_log` (with a
 * `reason` label) via the service role so the dashboard can show a history and
 * so billing alerts are auditable. Never throws — a notification failure must
 * not fail the webhook/cron that triggered it.
 *
 * Billing alerts are important, so if the owner has turned every channel off we
 * still fall back to email rather than going silent on a payment problem.
 */
export interface OwnerNotification {
  business: Pick<
    Business,
    "id" | "owner_email" | "owner_phone" | "notification_preferences"
  >;
  /** Machine label stored on the log row, e.g. "billing_past_due". */
  reason: string;
  subject: string;
  body: string;
}

export async function notifyOwner({
  business,
  reason,
  subject,
  body,
}: OwnerNotification): Promise<void> {
  const prefs = business.notification_preferences;
  const channels: NotificationType[] =
    prefs.channels.length > 0 ? prefs.channels : ["email"];

  const supabase = createAdminClient();

  for (const channel of channels) {
    let ok = false;
    // The channel actually used — usually equal to `channel`, but "sms" with
    // no phone on file falls back to email below. The log always records
    // what really happened, never what was merely requested (audit fix,
    // item 2: never silently claim "sent" when nothing was sent).
    let effectiveChannel: NotificationType = channel;

    try {
      if (channel === "sms" && !isUsablePhone(business.owner_phone)) {
        effectiveChannel = "email";
        ok = await dispatchEmail({
          to: business.owner_email,
          subject: `[No phone on file — texted instead] ${subject}`,
          body,
        });
      } else if (channel === "sms") {
        ok = await dispatchSms({ to: business.owner_phone as string, body });
      } else {
        ok = await dispatchEmail({ to: business.owner_email, subject, body });
      }
    } catch (err) {
      console.error(
        `[notify] ${channel} dispatch threw`,
        err instanceof Error ? err.message : "unknown error",
      );
      ok = false;
    }

    const { error } = await supabase.from("notifications_log").insert({
      business_id: business.id,
      type: effectiveChannel,
      related_booking_id: null,
      status: ok ? "sent" : "failed",
      reason,
    });
    if (error) {
      console.error("[notify] failed to write notifications_log", error);
    }
  }
}
