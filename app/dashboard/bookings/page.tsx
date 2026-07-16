import type { Metadata } from "next";
import Link from "next/link";

import { BookingStatusControls } from "@/components/dashboard/BookingStatusControls";
import {
  BookingsCalendar,
  mondayOfWeekUTC,
} from "@/components/dashboard/BookingsCalendar";
import { FollowUpButton } from "@/components/dashboard/FollowUpButton";
import { ReviewRequestButton } from "@/components/dashboard/ReviewRequestButton";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Booking, BookingStatus } from "@/lib/types/database";

export const metadata: Metadata = { title: "Bookings" };

/** A booking row plus the confidence flag of the conversation it came from. */
type BookingRow = Booking & {
  conversation: { id: string; ai_confidence_flag: boolean } | null;
};

/** Statuses where a review request makes sense (job handled). */
const REVIEWABLE_STATUSES: BookingStatus[] = ["confirmed", "owner_contacted"];

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

function BookingCard({
  booking,
  prominent,
  reviewLinkSet,
}: {
  booking: BookingRow;
  prominent: boolean;
  /** Whether the business has a review_link configured (enables review asks). */
  reviewLinkSet: boolean;
}) {
  const flagged = booking.conversation?.ai_confidence_flag ?? false;
  const canText = Boolean(booking.customer_phone);
  const canAskReview =
    canText && reviewLinkSet && REVIEWABLE_STATUSES.includes(booking.status);

  return (
    <Card
      id={`booking-${booking.id}`}
      className={
        "scroll-mt-24 p-5 " +
        (prominent ? "border-brand-300 ring-1 ring-brand-100" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink-900">
            {booking.customer_name ?? "Unknown customer"}
          </p>
          {booking.customer_phone ? (
            <p className="mt-0.5 text-sm text-muted">
              {booking.customer_phone}
            </p>
          ) : null}
        </div>
        <StatusBadge status={booking.status} />
      </div>

      {flagged ? (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          The AI wasn&apos;t fully sure it got this right — double-check the details.
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Service" value={booking.requested_service ?? "—"} />
        <Field label="Preferred time" value={booking.preferred_time ?? "—"} />
      </div>
      {booking.notes ? (
        <div className="mt-3">
          <Field label="Notes" value={booking.notes} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <BookingStatusControls bookingId={booking.id} status={booking.status} />
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <Button variant="secondary" size="sm" asChild>
            <a href={`/api/export/booking-ics?id=${booking.id}`}>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-2.25 6v7.25c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V8h-13Z" />
              </svg>
              Add to calendar
            </a>
          </Button>
          <span>{formatDateTime(booking.created_at)}</span>
          {booking.conversation ? (
            <Link
              href={`/dashboard/conversations/${booking.conversation.id}`}
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              View chat
            </Link>
          ) : null}
        </div>
      </div>

      {canText ? (
        <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-border pt-3">
          <FollowUpButton bookingId={booking.id} />
          {canAskReview ? <ReviewRequestButton bookingId={booking.id} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

/** Segmented list/week toggle — plain links, so it stays server-rendered. */
function ViewToggle({ view }: { view: "list" | "week" }) {
  const item = (target: "list" | "week", label: string) => (
    <Link
      href={`/dashboard/bookings?view=${target}`}
      aria-current={view === target ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        view === target
          ? "bg-brand-600 text-white"
          : "text-ink-700 hover:bg-ink-100",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-white p-0.5">
      {item("list", "List")}
      {item("week", "Week")}
    </div>
  );
}

/** Page size for "Load more" — also the increment each click adds. */
const PAGE_SIZE = 50;

const MS_PER_DAY = 86_400_000;

/** ?week= must be a real YYYY-MM-DD date; anything else means "this week". */
function parseWeekParam(raw: string | undefined): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; view?: string; week?: string }>;
}) {
  const context = await requireAuth();
  if (!context) return null;
  const reviewLinkSet = Boolean(context.business.review_link);

  const params = await searchParams;
  const view: "list" | "week" = params.view === "week" ? "week" : "list";

  const supabase = await createClient();

  const headerActions = (
    <>
      <ViewToggle view={view} />
      <Button variant="secondary" asChild>
        <Link href="/dashboard/reports">Weekly report</Link>
      </Button>
      <Button variant="secondary" asChild>
        <a href="/api/export/bookings">Export CSV</a>
      </Button>
    </>
  );

  if (view === "week") {
    const weekStart = mondayOfWeekUTC(parseWeekParam(params.week));
    const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .gte("created_at", weekStart.toISOString())
      .lt("created_at", weekEnd.toISOString())
      .order("created_at", { ascending: true })
      .limit(500)
      .returns<Booking[]>();

    return (
      <PageLayout
        title="Bookings"
        description="Jobs your AI captured, laid out over the week."
        actions={headerActions}
      >
        <BookingsCalendar
          bookings={data ?? []}
          weekStartISO={weekStart.toISOString().slice(0, 10)}
        />
      </PageLayout>
    );
  }

  const requestedLimit = Number.parseInt(params.limit ?? "", 10);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 5000)
      : PAGE_SIZE;

  const { data } = await supabase
    .from("bookings")
    .select("*, conversation:conversations(id, ai_confidence_flag)")
    .order("created_at", { ascending: false })
    // Fetch one extra row to detect whether there's more beyond this page.
    .range(0, limit)
    .returns<BookingRow[]>();

  const hasMore = (data?.length ?? 0) > limit;
  const bookings = (data ?? []).slice(0, limit);
  // New/unactioned bookings are the most important thing on the page (design §5).
  const fresh = bookings.filter((b) => b.status === "new");
  const rest = bookings.filter((b) => b.status !== "new");

  // One subtle nudge (not per-card) when review requests would light up if the
  // owner added their review link in Settings.
  const showReviewLinkHint =
    !reviewLinkSet &&
    bookings.some(
      (b) => b.customer_phone && REVIEWABLE_STATUSES.includes(b.status),
    );

  return (
    <PageLayout
      title="Bookings"
      description="Jobs your AI captured. Newest ones need your action first."
      actions={headerActions}
    >
      {bookings.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            No bookings yet. When your AI books a job, it shows up here.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {showReviewLinkHint ? (
            <p className="text-xs text-muted">
              <Link
                href="/dashboard/settings"
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                Add your review link in Settings
              </Link>{" "}
              to enable one-tap review requests on handled bookings.
            </p>
          ) : null}

          {fresh.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
                Needs your action
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {fresh.length}
                </span>
              </h2>
              <div className="space-y-4">
                {fresh.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    prominent
                    reviewLinkSet={reviewLinkSet}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted">
                Handled
              </h2>
              <div className="space-y-4">
                {rest.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    prominent={false}
                    reviewLinkSet={reviewLinkSet}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Link
            href={`/dashboard/bookings?limit=${limit + PAGE_SIZE}`}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </PageLayout>
  );
}
