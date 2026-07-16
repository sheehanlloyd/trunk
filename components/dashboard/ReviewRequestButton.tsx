"use client";

import { useActionState } from "react";

import { sendReviewRequest, type ActionResult } from "@/app/dashboard/bookings/actions";
import { Button } from "@/components/shared/Button";

const initial: ActionResult = { ok: false };

/**
 * One-tap "text this customer a review link" (v2). Rendered only when the
 * booking is eligible (phone on file, handled status, review_link configured) —
 * the server action re-checks all of that anyway. Collapses to a confirmation
 * once sent; the action refuses repeats, so this can't spam a customer.
 */
export function ReviewRequestButton({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState(
    async (): Promise<ActionResult> => sendReviewRequest(bookingId),
    initial,
  );

  if (state.ok) {
    return (
      <p className="text-sm font-medium text-revenue-700">
        ✓ Review request sent
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        className="min-h-9"
      >
        Request a review
      </Button>
      {state.error ? (
        <p className="text-xs text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
