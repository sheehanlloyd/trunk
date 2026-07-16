import { NextResponse } from "next/server";

import { getCurrentBusiness } from "@/lib/auth/session";
import { toCsv, type CsvColumn } from "@/lib/export/csv";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types/database";

export const runtime = "nodejs";

/** Hard cap on exported rows — matches the bookings page's max page size. */
const EXPORT_CAP = 5000;

type BookingExportRow = Pick<
  Booking,
  | "id"
  | "customer_name"
  | "customer_phone"
  | "requested_service"
  | "preferred_time"
  | "notes"
  | "status"
  | "conversation_id"
  | "created_at"
>;

const COLUMNS: CsvColumn[] = [
  { key: "id", label: "id" },
  { key: "customer_name", label: "customer_name" },
  { key: "customer_phone", label: "customer_phone" },
  { key: "requested_service", label: "requested_service" },
  { key: "preferred_time", label: "preferred_time" },
  { key: "notes", label: "notes" },
  { key: "status", label: "status" },
  { key: "conversation_id", label: "conversation_id" },
  { key: "created_at", label: "created_at" },
];

/**
 * GET /api/export/bookings — the signed-in owner's bookings as a CSV download.
 * Reads through the cookie-scoped client so RLS guarantees tenant isolation;
 * the explicit business_id filter is defense in depth (same pattern as the
 * dashboard's server actions).
 */
export async function GET() {
  const context = await getCurrentBusiness();
  if (!context) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, customer_name, customer_phone, requested_service, preferred_time, notes, status, conversation_id, created_at",
    )
    .eq("business_id", context.business.id)
    .order("created_at", { ascending: false })
    .limit(EXPORT_CAP)
    .returns<BookingExportRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Could not load bookings." },
      { status: 500 },
    );
  }

  const csv = toCsv(data ?? [], COLUMNS);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
