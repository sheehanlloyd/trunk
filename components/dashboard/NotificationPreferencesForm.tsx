"use client";

import { useActionState } from "react";

import {
  saveNotificationPreferences,
  type ActionResult,
} from "@/app/dashboard/actions";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";
import { useState } from "react";

import type { NotificationPreferences } from "@/lib/types/database";

const INITIAL: ActionResult = { ok: false };

/**
 * Notification preferences (design §12). The instant-for-bookings/emergencies
 * vs digest-for-everything-else split is fixed product behavior, stated plainly
 * here; the owner only chooses the channel(s) and whether to get the digest.
 *
 * Audit fix (item 2): SMS needs a real mobile number to send to — this form
 * collects it (into `businesses.owner_phone`) right next to the "Text me"
 * choice, and warns inline if SMS is selected without one on file, so it's
 * obvious *before* saving rather than a silent no-op notification later.
 */
export function NotificationPreferencesForm({
  prefs,
  ownerPhone,
}: {
  prefs: NotificationPreferences;
  ownerPhone: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveNotificationPreferences,
    INITIAL,
  );
  const [smsChecked, setSmsChecked] = useState(prefs.channels.includes("sms"));
  const [phone, setPhone] = useState(ownerPhone ?? "");
  const missingPhoneForSms = smsChecked && phone.trim().replace(/\D/g, "").length < 7;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-900">
              How should we reach you?
            </legend>
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-900">
              <input
                type="checkbox"
                name="channels"
                value="sms"
                checked={smsChecked}
                onChange={(e) => setSmsChecked(e.target.checked)}
                className="h-5 w-5"
              />
              Text me (SMS) — fastest on a job site
            </label>
            {smsChecked ? (
              <label className="mb-2 ml-8 block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Your mobile number
                </span>
                <input
                  type="tel"
                  name="owner_phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. (512) 555-0100"
                  className="w-full max-w-xs rounded-lg border border-border px-3 py-2 text-sm text-slate-900"
                />
                {missingPhoneForSms ? (
                  <span className="mt-1 block text-xs text-copper-700">
                    Add a mobile number to actually receive texts — without one,
                    we&apos;ll email you instead.
                  </span>
                ) : null}
              </label>
            ) : (
              // Keep the value in the form even when the SMS field is hidden,
              // so unchecking "Text me" doesn't erase a saved number.
              <input type="hidden" name="owner_phone" value={phone} />
            )}
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-900">
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

          <label className="flex min-h-11 items-center gap-3 border-t border-border pt-3 text-sm text-slate-900">
            <input
              type="checkbox"
              name="daily_digest"
              defaultChecked={prefs.daily_digest}
              className="h-5 w-5"
            />
            Send me a daily activity digest
          </label>

          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
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
