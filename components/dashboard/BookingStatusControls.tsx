"use client";

import { useState, useTransition } from "react";

import { updateBookingStatus } from "@/app/dashboard/actions";
import { Button } from "@/components/shared/Button";
import type { BookingStatus } from "@/lib/types/database";

type Action = { label: string; next: BookingStatus; variant?: "primary" | "secondary" | "danger" };

/** Which one-tap actions make sense from each status. */
const ACTIONS: Record<BookingStatus, Action[]> = {
  new: [
    { label: "Confirm", next: "confirmed", variant: "primary" },
    { label: "I contacted them", next: "owner_contacted", variant: "secondary" },
    { label: "Cancel", next: "canceled", variant: "danger" },
  ],
  confirmed: [
    { label: "I contacted them", next: "owner_contacted", variant: "secondary" },
    { label: "Cancel", next: "canceled", variant: "danger" },
  ],
  owner_contacted: [
    { label: "Confirm", next: "confirmed", variant: "primary" },
    { label: "Cancel", next: "canceled", variant: "danger" },
  ],
  canceled: [{ label: "Reopen", next: "new", variant: "secondary" }],
};

/**
 * One-tap booking status update (design §5). Large touch targets for a phone on
 * a job site; the whole row is disabled while the change is in flight.
 */
export function BookingStatusControls({
  bookingId,
  status,
}: {
  bookingId: string;
  status: BookingStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(next: BookingStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateBookingStatus(bookingId, next);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS[status].map((a) => (
          <Button
            key={a.next}
            size="md"
            variant={a.variant ?? "secondary"}
            loading={pending}
            onClick={() => apply(a.next)}
            className="min-h-11"
          >
            {a.label}
          </Button>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
