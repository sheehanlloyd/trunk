import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { CLAUDE_MODEL, getAnthropic } from "@/lib/ai/anthropic";
import type { CleanedSite, OnboardingDraft } from "@/lib/onboarding/types";
import type { ServiceItem } from "@/lib/types/database";

/** Cap on characters sent to the model — controls cost and stays well under limits. */
const MAX_EXTRACT_CHARS = 16_000;

/**
 * Structured schema Claude must fill. Optional/unknown fields use empty strings
 * (rather than optionals) to keep the schema strict-output friendly; hours are
 * an array of {day, hours} instead of a map for the same reason. We normalize
 * to the app's shapes afterward.
 */
const ExtractionSchema = z.object({
  name: z.string().describe("The business's public name. Empty string if unclear."),
  service_area: z
    .string()
    .describe("City/region/radius the business serves. Empty string if not stated."),
  services: z
    .array(
      z.object({
        service: z.string().describe("Short service name, e.g. 'Drain cleaning'."),
        description: z.string().describe("One-line description, or empty string."),
        price_range: z
          .string()
          .describe("Price or range if stated (e.g. '$100–$300'), else empty string."),
      }),
    )
    .describe("Distinct services offered. Empty array if none can be determined."),
  hours: z
    .array(
      z.object({
        day: z.string().describe("Day of week, lowercase, e.g. 'monday'."),
        hours: z.string().describe("Hours for that day, e.g. '8am–6pm' or 'Closed'."),
      }),
    )
    .describe("Business hours by day. Empty array if not stated."),
  emergency_policy: z
    .string()
    .describe(
      "How after-hours emergencies are handled, if mentioned. Empty string otherwise.",
    ),
  contact: z.object({
    phone: z.string().describe("Primary phone number, or empty string."),
    email: z.string().describe("Contact email, or empty string."),
    address: z.string().describe("Physical address, or empty string."),
  }),
});

const SYSTEM_PROMPT =
  "You extract structured business information from the visible text of a " +
  "company's website, for onboarding an AI receptionist. Only use facts present " +
  "in the provided text — never invent services, prices, hours, or contact " +
  "details. If something isn't stated, leave it blank. Prefer concise, " +
  "customer-facing service names. This must work for any trade or local " +
  "business; do not assume a specific industry.";

function cleanService(s: {
  service: string;
  description: string;
  price_range: string;
}): ServiceItem | null {
  const service = s.service?.trim();
  if (!service) return null;
  const item: ServiceItem = { service };
  if (s.description?.trim()) item.description = s.description.trim();
  if (s.price_range?.trim()) item.price_range = s.price_range.trim();
  return item;
}

/** Builds operator-facing warnings for thin or missing extracted data. */
function buildWarnings(draft: Omit<OnboardingDraft, "warnings">): string[] {
  const warnings: string[] = [];
  if (!draft.name) warnings.push("Could not determine the business name — please add it.");
  if (draft.services.length === 0)
    warnings.push("No services were detected — add the main services manually.");
  if (!draft.service_area)
    warnings.push("No service area was found — set the city or region served.");
  if (Object.keys(draft.hours).length === 0)
    warnings.push("No business hours were found — add them if available.");
  if (!draft.emergency_policy)
    warnings.push(
      "No after-hours/emergency policy detected — define how urgent calls should be handled.",
    );
  return warnings;
}

/**
 * Runs LLM extraction over cleaned site text and returns a reviewed-ready
 * draft. Business-agnostic: the same prompt + schema handle every tenant, so
 * onboarding client #500 needs no new code.
 */
export async function extractDraft(site: CleanedSite): Promise<OnboardingDraft> {
  const anthropic = getAnthropic();
  const text = site.text.slice(0, MAX_EXTRACT_CHARS);

  const response = await anthropic.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Website: ${site.url}\n` +
          (site.title ? `Page title: ${site.title}\n` : "") +
          `\nVisible text:\n"""\n${text}\n"""`,
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Extraction returned no structured output.");
  }

  const services = parsed.services
    .map(cleanService)
    .filter((s): s is ServiceItem => s !== null);

  const hours: Record<string, string> = {};
  for (const entry of parsed.hours) {
    const day = entry.day?.trim().toLowerCase();
    const value = entry.hours?.trim();
    if (day && value) hours[day] = value;
  }

  const base: Omit<OnboardingDraft, "warnings"> = {
    name: parsed.name?.trim() ?? "",
    service_area: parsed.service_area?.trim() ?? "",
    services,
    hours,
    emergency_policy: parsed.emergency_policy?.trim() ?? "",
    contact: {
      phone: parsed.contact.phone?.trim() || undefined,
      email: parsed.contact.email?.trim() || undefined,
      address: parsed.contact.address?.trim() || undefined,
    },
  };

  return { ...base, warnings: buildWarnings(base) };
}
