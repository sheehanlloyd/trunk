"use client";

import { useActionState, useState } from "react";

import { sendFollowUp, type ActionResult } from "@/app/dashboard/bookings/actions";
import { Button } from "@/components/shared/Button";
import { Textarea } from "@/components/shared/Input";

const MAX_CHARS = 320;

const initial: ActionResult = { ok: false };

/**
 * Expandable "text the customer" composer (v2): a small trigger button that
 * reveals an inline textarea, sends through the sendFollowUp action, and
 * reports success/failure in place. The whole form disables while in flight.
 */
export function FollowUpButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData): Promise<ActionResult> => {
      const message = String(formData.get("message") ?? "");
      const result = await sendFollowUp(bookingId, message);
      if (result.ok) {
        setOpen(false);
        setDraft("");
      }
      return result;
    },
    initial,
  );

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-9"
          onClick={() => setOpen(true)}
        >
          Text customer
        </Button>
        {state.ok ? (
          <p className="text-sm font-medium text-revenue-700">✓ Text sent</p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full max-w-md rounded-lg border border-border bg-white p-3"
    >
      <label
        htmlFor={`follow-up-${bookingId}`}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted"
      >
        Text the customer
      </label>
      <Textarea
        id={`follow-up-${bookingId}`}
        name="message"
        rows={3}
        maxLength={MAX_CHARS}
        required
        disabled={pending}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. Hi, this is us confirming your appointment — we'll see you then!"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {draft.length}/{MAX_CHARS}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="text-xs font-medium text-muted hover:text-ink-700"
          >
            Cancel
          </button>
          <Button type="submit" size="sm" loading={pending} className="min-h-9">
            Send text
          </Button>
        </div>
      </div>
      {!state.ok && state.error ? (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
