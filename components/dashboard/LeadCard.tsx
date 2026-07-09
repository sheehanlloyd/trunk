import Link from "next/link";

import { ConvertLeadForm } from "@/components/dashboard/ConvertLeadForm";
import { LeadResolveControls } from "@/components/dashboard/LeadResolveControls";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { formatDateTime, leadReasonLabel } from "@/lib/dashboard/format";
import type { Lead } from "@/lib/types/database";

/**
 * Tone per reason (wording itself comes from the shared leadReasonLabel, which
 * the weekly report uses too). Copper = attention (money walked away mid-flow);
 * ink = neutral fact; brand = customer explicitly asked for the owner.
 * Reasons are free text (0004_leads.sql), so unknown values render neutral.
 */
const REASON_TONES: Record<string, string> = {
  incomplete: "bg-copper-50 text-copper-700 ring-1 ring-copper-100",
  out_of_area: "bg-ink-100 text-ink-700 ring-1 ring-ink-200",
  needs_callback: "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
};

function ReasonBadge({ reason }: { reason: string | null }) {
  const label = leadReasonLabel(reason);
  if (!label) return null;
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold " +
        (REASON_TONES[reason ?? ""] ?? "bg-ink-100 text-ink-700 ring-1 ring-ink-200")
      }
    >
      {label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-ink-900">{value}</p>
    </div>
  );
}

/**
 * One missed-opportunity card. The leads engine captures whatever partial info
 * it got before the customer bailed, so every field can be missing — show what
 * we know and mark the gaps rather than hiding them. The call button is the
 * core action: owners work this page from their truck.
 */
export function LeadCard({ lead }: { lead: Lead }) {
  const resolved = lead.resolved_at != null;
  return (
    <Card className={"p-5 " + (resolved ? "opacity-75" : "")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink-900">
            {lead.customer_name ?? "Name not captured"}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {lead.customer_phone ?? "No phone number"}
          </p>
        </div>
        <ReasonBadge reason={lead.reason} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Service" value={lead.requested_service ?? "—"} />
        <Field label="Preferred time" value={lead.preferred_time ?? "—"} />
      </div>
      {lead.notes ? (
        <div className="mt-3">
          <Field label="Notes" value={lead.notes} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {lead.customer_phone ? (
            <Button asChild size="md" className="min-h-11">
              <a href={`tel:${lead.customer_phone}`}>
                Call {lead.customer_phone}
              </a>
            </Button>
          ) : null}
          <LeadResolveControls leadId={lead.id} resolved={resolved} />
          {/* Third action on purpose: call first, file away second — convert
              only once the callback actually won the job. Open leads only. */}
          {!resolved ? <ConvertLeadForm lead={lead} /> : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{formatDateTime(lead.created_at)}</span>
          {lead.conversation_id ? (
            <Link
              href={`/dashboard/conversations/${lead.conversation_id}`}
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              View chat
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
