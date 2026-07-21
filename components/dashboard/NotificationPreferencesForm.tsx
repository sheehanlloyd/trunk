"use client";

import { useActionState } from "react";

import {
  saveNotificationPreferences,
  type ActionResult,
} from "@/app/dashboard/actions";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";
import type { NotificationPreferences } from "@/lib/types/database";

const INITIAL: ActionResult = { ok: false };

/**
 * Notification preferences (design §12). The instant-for-bookings/emergencies
 * vs digest-for-everything-else split is fixed product behavior, stated plainly
 * here; the owner only chooses the channel(s) and whether to get the digest.
 */
export function NotificationPreferencesForm({
  prefs,
}: {
  prefs: NotificationPreferences;
}) {
  const [state, formAction, pending] = useActionState(
    saveNotificationPreferences,
    INITIAL,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-900">
              How should we reach you?
            </legend>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink-900">
              <input
                type="checkbox"
                name="channels"
                value="sms"
                defaultChecked={prefs.channels.includes("sms")}
                className="h-5 w-5"
              />
              Text me (SMS) — fastest on a job site
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink-900">
              <input
                type="checkbox"
                name="channels"
                value="email"
                defaultChecked={prefs.channels.includes("email")}
                className="h-5 w-5"
              />
              Email me
            </label>
          </fieldset>

          <label className="flex min-h-11 items-center gap-3 border-t border-border pt-3 text-sm text-ink-900">
            <input
              type="checkbox"
              name="daily_digest"
              defaultChecked={prefs.daily_digest}
              className="h-5 w-5"
            />
            Send me a daily activity digest
          </label>

          <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
            Bookings and emergencies always alert you instantly. Everything else
            is batched into your daily digest so you&apos;re not buzzed all day.
          </p>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              {state.error ? (
                <span className="text-red-600">{state.error}</span>
              ) : null}
              {state.ok ? (
                <span className="font-medium text-accent-700">Saved.</span>
              ) : null}
            </div>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
