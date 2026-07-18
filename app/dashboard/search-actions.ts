"use server";

import { getCurrentBusiness } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Conversation, Lead } from "@/lib/types/database";

/**
 * Server-side search behind the ⌘K command palette. Auth-guarded and queried
 * through the cookie-scoped RLS client, so results are always limited to the
 * caller's own business.
 */

export type SearchResultType = "conversation" | "booking" | "lead";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Builds a safe `%…%` ilike pattern. Escapes the LIKE wildcards (% and _) so
 * user input matches literally, and strips quotes/backslashes so the pattern
 * can be embedded in a PostgREST `.or()` quoted value without breaking parsing.
 */
function toLikePattern(query: string): string {
  const cleaned = query.replace(/["\\]/g, "");
  return `%${cleaned.replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

type ConversationHit = Pick<
  Conversation,
  "id" | "customer_name" | "customer_phone" | "channel" | "created_at"
>;
type BookingHit = Pick<
  Booking,
  "id" | "customer_name" | "customer_phone" | "requested_service" | "created_at"
>;
type LeadHit = Pick<
  Lead,
  "id" | "customer_name" | "customer_phone" | "requested_service" | "created_at"
>;

function who(row: { customer_name: string | null; customer_phone: string | null }) {
  return row.customer_name ?? row.customer_phone ?? "Unknown caller";
}

export async function searchEverything(query: string): Promise<SearchResult[]> {
  const context = await getCurrentBusiness();
  if (!context) return [];

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const pattern = toLikePattern(trimmed);
  // Quoted values keep any user-typed commas/parens from breaking or-parsing.
  const nameOrPhone = `customer_name.ilike."${pattern}",customer_phone.ilike."${pattern}"`;
  const nameOrPhoneOrService = `${nameOrPhone},requested_service.ilike."${pattern}"`;

  const supabase = await createClient();
  const [conversations, bookings, leads] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, customer_name, customer_phone, channel, created_at")
      .or(nameOrPhone)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<ConversationHit[]>(),
    supabase
      .from("bookings")
      .select("id, customer_name, customer_phone, requested_service, created_at")
      .or(nameOrPhoneOrService)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<BookingHit[]>(),
    supabase
      .from("leads")
      .select("id, customer_name, customer_phone, requested_service, created_at")
      .or(nameOrPhoneOrService)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<LeadHit[]>(),
  ]);

  const results: SearchResult[] = [];

  for (const c of conversations.data ?? []) {
    results.push({
      type: "conversation",
      id: c.id,
      title: who(c),
      subtitle: `${c.channel === "voice" ? "Call" : "Chat"} · ${formatDateTime(c.created_at)}`,
      href: `/dashboard/conversations/${c.id}`,
    });
  }

  for (const b of bookings.data ?? []) {
    results.push({
      type: "booking",
      id: b.id,
      title: who(b),
      subtitle: `${b.requested_service ?? "Booking"} · ${formatDateTime(b.created_at)}`,
      href: "/dashboard/bookings",
    });
  }

  for (const l of leads.data ?? []) {
    results.push({
      type: "lead",
      id: l.id,
      title: who(l),
      subtitle: `${l.requested_service ?? "Lead"} · ${formatDateTime(l.created_at)}`,
      href: "/dashboard/leads",
    });
  }

  return results;
}
