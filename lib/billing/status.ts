import type { BusinessStatus } from "@/lib/types/database";

/**
 * The billing "effective status" gate (design §10). Kept pure so both the widget
 * frame and the chat API can share one definition, and so it's unit-testable.
 *
 * A business stops serving customers only when it is truly `paused`, OR when it
 * is `past_due` and its grace window has already elapsed. Crucially, a `past_due`
 * business WITHIN its grace window keeps serving — design §10 says never cut off
 * on the first failed payment. This lazy check means service reflects reality
 * even before the daily grace sweep flips the stored status to `paused`.
 */
export function isPaused(
  status: BusinessStatus,
  gracePeriodEndsAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status === "paused") return true;
  if (status === "past_due" && gracePeriodEndsAt) {
    return now.getTime() > new Date(gracePeriodEndsAt).getTime();
  }
  return false;
}

/** True when the AI receptionist should answer for this business. */
export function isServiceLive(
  status: BusinessStatus,
  gracePeriodEndsAt: string | null,
  now: Date = new Date(),
): boolean {
  return !isPaused(status, gracePeriodEndsAt, now);
}
