import type { Metadata } from "next";
import Link from "next/link";

import { BookingStatusControls } from "@/components/dashboard/BookingStatusControls";
import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requireAuth } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types/database";

export const metadata: Metadata = { title: "Bookings — AI Receptionist" };

/** A booking row plus the confidence flag of the conversation it came from. */
type BookingRow = Booking & {
  conversation: { id: string; ai_confidence_flag: boolean } | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-900">{value}</p>
    </div>
  );
}

function BookingCard({
  booking,
  prominent,
}: {
  booking: BookingRow;
  prominent: boolean;
}) {
  const flagged = booking.conversation?.ai_confidence_flag ?? false;
  return (
    <Card
      className={
        "p-5 " +
        (prominent ? "border-brand-300 ring-1 ring-brand-100" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">
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
        <div className="flex items-center gap-3 text-xs text-muted">
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
    </Card>
  );
}

/** Page size for "Load more" — also the increment each click adds. */
const PAGE_SIZE = 50;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const context = await requireAuth();
  if (!context) return null;

  const params = await searchParams;
  const requestedLimit = Number.parseInt(params.limit ?? "", 10);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 5000)
      : PAGE_SIZE;

  const supabase = await createClient();
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

  return (
    <PageLayout
      title="Bookings"
      description="Jobs your AI captured. Newest ones need your action first."
    >
      {bookings.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            No bookings yet. When your AI books a job, it shows up here.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {fresh.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                Needs your action
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {fresh.length}
                </span>
              </h2>
              <div className="space-y-4">
                {fresh.map((b) => (
                  <BookingCard key={b.id} booking={b} prominent />
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
                  <BookingCard key={b.id} booking={b} prominent={false} />
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
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </PageLayout>
  );
}
