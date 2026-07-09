import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import { requireAuth } from "@/lib/auth/session";
import { formatDateTime, sevenDaysAgoISO } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { NotificationLog } from "@/lib/types/database";

export const metadata: Metadata = { title: "Activity" };

/**
 * Known notification reasons -> owner-friendly copy. The reason column is
 * free text written by several senders (billing webhooks, booking alerts, the
 * digest job), so anything unknown falls back to a prettified version of the
 * raw value rather than leaking snake_case into the UI.
 */
const REASON_LABELS: Record<string, string> = {
  booking_created: "New booking alert",
  emergency: "Emergency escalation",
  billing_past_due: "Payment problem notice",
  billing_paused: "Service paused notice",
  digest: "Daily digest",
};

function reasonLabel(reason: string | null): string {
  if (!reason) return "Notification";
  const known = REASON_LABELS[reason];
  if (known) return known;
  const words = reason.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Page size for "Load more" — also the increment each click adds. */
const PAGE_SIZE = 100;

export default async function ActivityPage({
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
  const weekAgo = sevenDaysAgoISO();

  // The list plus head-only counts for the 7-day summary; counting server-side
  // keeps the summary honest even when the list is paginated.
  const [{ data }, { count: sentCount }, { count: failedCount }] =
    await Promise.all([
      supabase
        .from("notifications_log")
        .select("*")
        .order("created_at", { ascending: false })
        // Fetch one extra row to detect whether there's more beyond this page.
        .range(0, limit)
        .returns<NotificationLog[]>(),
      supabase
        .from("notifications_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", weekAgo),
      supabase
        .from("notifications_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", weekAgo),
    ]);

  const hasMore = (data?.length ?? 0) > limit;
  const rows = (data ?? []).slice(0, limit);
  const failed = failedCount ?? 0;

  return (
    <PageLayout
      title="Activity"
      description="Every alert we've sent you — bookings, emergencies, billing, and digests."
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>
          Last 7 days:{" "}
          <span className="font-semibold text-ink-900">
            {sentCount ?? 0} sent
          </span>
        </span>
        <span>
          <span
            className={
              "font-semibold " +
              (failed > 0 ? "text-copper-700" : "text-ink-900")
            }
          >
            {failed} failed
          </span>
        </span>
      </div>

      {failed > 0 ? (
        <div className="mb-4 rounded-lg border border-copper-200 bg-copper-50 px-4 py-3 text-sm text-copper-700">
          Some alerts failed to send — check your{" "}
          <Link
            href="/dashboard/settings"
            className="font-medium underline underline-offset-2"
          >
            notification settings
          </Link>
          .
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            No activity yet. When we text or email you about a booking or
            emergency, it shows up here.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {reasonLabel(n.reason)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{formatDateTime(n.created_at)}</span>
                    {n.related_booking_id ? (
                      <Link
                        href="/dashboard/bookings"
                        className="font-medium text-brand-700 underline underline-offset-2"
                      >
                        View booking
                      </Link>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-700">
                    {n.type === "sms" ? "SMS" : "Email"}
                  </span>
                  {n.status === "sent" ? (
                    <span className="inline-flex items-center rounded-full bg-revenue-50 px-2.5 py-0.5 text-xs font-medium text-revenue-700">
                      Sent
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-copper-50 px-2.5 py-0.5 text-xs font-medium text-copper-700">
                      Failed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Link
            href={`/dashboard/activity?limit=${limit + PAGE_SIZE}`}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </PageLayout>
  );
}
