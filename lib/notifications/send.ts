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
    try {
      ok =
        channel === "sms"
          ? business.owner_phone
            ? await dispatchSms({ to: business.owner_phone, body })
            : // SMS opted in but no mobile on file yet — email instead of
              // dropping the alert; Settings prompts the owner to add one.
              await dispatchEmail({ to: business.owner_email, subject, body })
          : await dispatchEmail({ to: business.owner_email, subject, body });
    } catch (err) {
      console.error(`[notify] ${channel} dispatch threw`, err);
      ok = false;
    }

    const { error } = await supabase.from("notifications_log").insert({
      business_id: business.id,
      type: channel,
      related_booking_id: null,
      status: ok ? "sent" : "failed",
      reason,
    });
    if (error) {
      console.error("[notify] failed to write notifications_log", error);
    }
  }
}
