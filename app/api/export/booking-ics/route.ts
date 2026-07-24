import { NextResponse } from "next/server";

import { getCurrentBusiness } from "@/lib/auth/session";
import { bookingToIcs, type BookingIcsInput } from "@/lib/export/ics";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Filenames stay boring ASCII: the service's first word, or "job". */
function filenameSlug(service: string | null): string {
  const first = (service ?? "").trim().split(/\s+/)[0] ?? "";
  const slug = first.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return slug || "job";
}

/**
 * GET /api/export/booking-ics?id=<bookingId> — one booking as a downloadable
 * .ics follow-up reminder (see lib/export/ics.ts for the event semantics).
 * Reads through the cookie-scoped client so RLS guarantees tenant isolation;
 * the explicit business_id filter is defense in depth (same pattern as the
 * bookings CSV export).
 */
export async function GET(request: Request) {
  const context = await getCurrentBusiness();
  if (!context) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }
  // A malformed UUID would make Postgres error (500); treat it as "not found".
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, customer_name, customer_phone, requested_service, preferred_time, notes, created_at",
    )
    .eq("business_id", context.business.id)
    .eq("id", id)
    .maybeSingle<BookingIcsInput>();

  if (error) {
    return NextResponse.json(
      { error: "Could not load the booking." },
      { status: 500 },
    );
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const ics = bookingToIcs(booking, context.business.name);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${filenameSlug(
        booking.requested_service,
      )}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
