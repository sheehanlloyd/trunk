"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  type ActionResult,
  convertLeadToBooking,
} from "@/app/dashboard/leads/actions";
import { Button } from "@/components/shared/Button";
import { Field, Input, Textarea } from "@/components/shared/Input";
import type { Lead } from "@/lib/types/database";

const INITIAL: ActionResult = { ok: false };

/**
 * "Convert to booking" for an open lead: the owner called back, won the job,
 * and records it without leaving the card. The inline form is PRE-FILLED from
 * whatever the AI already captured — on a phone in a truck, the common case
 * should be "tap, glance, confirm". Success collapses to a link into Bookings
 * (the card itself disappears from the Open tab on the next revalidation).
 */
export function ConvertLeadForm({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    convertLeadToBooking.bind(null, lead.id),
    INITIAL,
  );

  if (state.ok) {
    return (
      <Link
        href="/dashboard/bookings"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-revenue-50 px-4 text-sm font-medium text-revenue-700 hover:bg-revenue-100"
      >
        ✓ Booked — view in Bookings
      </Link>
    );
  }

  if (!open) {
    return (
      <Button
        size="md"
        variant="secondary"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        Convert to booking
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full space-y-3 rounded-lg border border-border bg-ink-50 p-4"
    >
      <p className="text-sm font-medium text-ink-900">Record the booking</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Customer name">
          <Input
            name="customer_name"
            required
            defaultValue={lead.customer_name ?? ""}
            placeholder="e.g. Dana Whitfield"
          />
        </Field>
        <Field label="Phone (optional)">
          <Input
            name="customer_phone"
            type="tel"
            defaultValue={lead.customer_phone ?? ""}
            placeholder="e.g. (555) 201-4433"
          />
        </Field>
        <Field label="Service">
          <Input
            name="requested_service"
            required
            defaultValue={lead.requested_service ?? ""}
            placeholder="e.g. Water heater replacement"
          />
        </Field>
        <Field label="Preferred time (optional)">
          <Input
            name="preferred_time"
            defaultValue={lead.preferred_time ?? ""}
            placeholder="e.g. Thursday morning"
          />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <Textarea
          name="notes"
          rows={2}
          defaultValue={lead.notes ?? ""}
          placeholder="Anything the crew should know"
        />
      </Field>

      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} className="min-h-11">
          Save booking
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
