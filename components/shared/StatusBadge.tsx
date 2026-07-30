import { cn } from "@/lib/utils";
import type {
  BookingStatus,
  BusinessStatus,
  ConversationOutcome,
} from "@/lib/types/database";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/* Squared badges with a hairline border rather than rounded pills — the pill
   is the single most template-looking element in SaaS UI, and a 4px rectangle
   reads as a technical label instead of a sticker. `info` is deliberately
   colorless: only money, attention, and danger earn a hue. */
const toneStyles: Record<Tone, string> = {
  neutral: "bg-ink-50 text-ink-600 border border-ink-200",
  info: "bg-ink-50 text-ink-700 border border-ink-200",
  success: "bg-revenue-50 text-revenue-700 border border-revenue-100",
  warning: "bg-copper-50 text-copper-700 border border-copper-100",
  danger: "bg-red-50 text-red-700 border border-red-100",
};

/** Every known status value maps to a { label, tone }. Single source of truth. */
const registry: Record<string, { label: string; tone: Tone }> = {
  // business_status
  trial: { label: "Trial", tone: "info" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "Past due", tone: "warning" },
  paused: { label: "Paused", tone: "neutral" },
  canceled: { label: "Canceled", tone: "danger" },
  // booking_status
  new: { label: "New", tone: "info" },
  confirmed: { label: "Confirmed", tone: "success" },
  owner_contacted: { label: "Owner contacted", tone: "neutral" },
  // conversation_outcome
  booked: { label: "Booked", tone: "success" },
  no_action: { label: "No action", tone: "neutral" },
  unclear: { label: "Unclear", tone: "warning" },
  emergency_escalated: { label: "Emergency", tone: "danger" },
  voicemail_left: { label: "Voicemail", tone: "info" },
};

interface StatusBadgeProps {
  status: BusinessStatus | BookingStatus | ConversationOutcome;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const entry = registry[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[11.5px] font-medium",
        toneStyles[entry.tone],
        className,
      )}
    >
      {entry.label}
    </span>
  );
}
