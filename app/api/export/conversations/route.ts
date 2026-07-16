import { NextResponse } from "next/server";

import { getCurrentBusiness } from "@/lib/auth/session";
import { toCsv, type CsvColumn } from "@/lib/export/csv";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/database";

export const runtime = "nodejs";

/** Hard cap on exported rows. */
const EXPORT_CAP = 5000;

const COLUMNS: CsvColumn[] = [
  { key: "id", label: "id" },
  { key: "channel", label: "channel" },
  { key: "customer_name", label: "customer_name" },
  { key: "customer_phone", label: "customer_phone" },
  { key: "outcome", label: "outcome" },
  { key: "ai_confidence_flag", label: "ai_confidence_flag" },
  { key: "summary", label: "summary" },
  { key: "transcript_turns", label: "transcript_turns" },
  { key: "created_at", label: "created_at" },
];

type ConversationExportRow = Pick<
  Conversation,
  | "id"
  | "channel"
  | "customer_name"
  | "customer_phone"
  | "outcome"
  | "ai_confidence_flag"
  | "summary"
  | "transcript"
  | "created_at"
>;

/**
 * GET /api/export/conversations — the signed-in owner's conversation log as a
 * CSV download. Deliberately exports a per-row `transcript_turns` count rather
 * than full transcripts: the CSV is for spreadsheet analysis, and dumping
 * whole chat logs into cells would be both unusable and a PII amplifier.
 */
export async function GET() {
  const context = await getCurrentBusiness();
  if (!context) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, channel, customer_name, customer_phone, outcome, ai_confidence_flag, summary, transcript, created_at",
    )
    .eq("business_id", context.business.id)
    .order("created_at", { ascending: false })
    .limit(EXPORT_CAP)
    .returns<ConversationExportRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Could not load conversations." },
      { status: 500 },
    );
  }

  const rows = (data ?? []).map(({ transcript, ...rest }) => ({
    ...rest,
    transcript_turns: Array.isArray(transcript) ? transcript.length : 0,
  }));

  const csv = toCsv(rows, COLUMNS);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversations-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
