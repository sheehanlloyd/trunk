"use client";

import { useState, useTransition } from "react";

import { markLeadResolved, reopenLead } from "@/app/dashboard/leads/actions";
import { Button } from "@/components/shared/Button";

/**
 * One-tap resolve/reopen for a lead (mirrors BookingStatusControls). Secondary
 * styling on purpose: the prominent action on a lead card is calling the
 * customer back, not filing the card away.
 */
export function LeadResolveControls({
  leadId,
  resolved,
}: {
  leadId: string;
  resolved: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = resolved
        ? await reopenLead(leadId)
        : await markLeadResolved(leadId);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div>
      <Button
        size="md"
        variant="secondary"
        loading={pending}
        onClick={apply}
        className="min-h-11"
      >
        {resolved ? "Reopen" : "Mark handled"}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
