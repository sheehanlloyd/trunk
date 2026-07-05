import type { Business, ServiceItem } from "@/lib/types/database";

/**
 * The AI context engine (design doc §11).
 *
 * `buildSystemPrompt` is a **pure function** of a business row — no I/O, no
 * client-specific branching. Every tenant flows through the exact same code;
 * only the stored data differs. This is what lets us add client #2, #50, or
 * #500 with zero new code. It is reused by chat (Phase 3) and voice (Phase 6)
 * via `getSystemPromptForBusiness`.
 */

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function formatServices(services: ServiceItem[]): string | null {
  const lines = services
    .filter((s) => s?.service && s.service.trim().length > 0)
    .map((s) => {
      const parts = [`- ${s.service.trim()}`];
      if (s.description?.trim()) parts.push(`: ${s.description.trim()}`);
      if (s.price_range?.trim()) parts.push(` (typical price: ${s.price_range.trim()})`);
      return parts.join("");
    });
  return lines.length > 0 ? lines.join("\n") : null;
}

function formatHours(hours: Record<string, string>): string | null {
  const entries = Object.entries(hours ?? {}).filter(
    ([, value]) => value && value.trim().length > 0,
  );
  if (entries.length === 0) return null;

  entries.sort(([a], [b]) => {
    const ia = DAY_ORDER.indexOf(a.toLowerCase());
    const ib = DAY_ORDER.indexOf(b.toLowerCase());
    // Unknown keys sort after known days, preserving their relative order.
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return entries
    .map(([day, value]) => {
      const label = day.charAt(0).toUpperCase() + day.slice(1);
      return `- ${label}: ${value.trim()}`;
    })
    .join("\n");
}

/**
 * Assembles the system prompt for a single business from its stored data.
 * Missing fields are omitted gracefully rather than rendered as empty/"null".
 */
export function buildSystemPrompt(business: Business): string {
  const name = business.name?.trim() || "this business";
  const sections: string[] = [];

  const intro = business.service_area?.trim()
    ? `You are the AI receptionist for ${name}, a local business serving ${business.service_area.trim()}.`
    : `You are the AI receptionist for ${name}, a local business.`;
  sections.push(intro);

  sections.push(
    "Your job is to answer questions from potential and existing customers, " +
      "explain the services offered, and help them book an appointment or " +
      "request a callback. Be warm, concise, and professional.",
  );

  const services = formatServices(business.services ?? []);
  if (services) {
    sections.push(`Services offered:\n${services}`);
  } else {
    sections.push(
      "The specific service list has not been provided. Do not invent " +
        "services — offer to take the customer's details so the team can follow up.",
    );
  }

  const hours = formatHours(business.hours ?? {});
  if (hours) sections.push(`Business hours:\n${hours}`);

  if (business.emergency_policy?.trim()) {
    sections.push(`After-hours / emergency policy:\n${business.emergency_policy.trim()}`);
  }

  sections.push(
    "Important guardrails: Only speak to the services and area above. If asked " +
      "about anything outside them — including prices you weren't given, or work " +
      "the business may not do — be honest that you're not sure and offer to have " +
      "someone follow up. Never guarantee pricing or availability you cannot " +
      "confirm. Never invent details about the business.",
  );

  return sections.join("\n\n");
}

/**
 * Fetches a business by id (service-role, so it works from unauthenticated
 * webhook contexts) and returns its assembled system prompt. This is the entry
 * point the chat and voice handlers call.
 */
export async function getSystemPromptForBusiness(
  businessId: string,
): Promise<string> {
  // Imported lazily so `buildSystemPrompt` (pure) can be used without pulling
  // in the service-role client and its eager env validation.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle<Business>();

  if (error) {
    throw new Error(`Failed to load business ${businessId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Business not found: ${businessId}`);
  }

  return buildSystemPrompt(data);
}
