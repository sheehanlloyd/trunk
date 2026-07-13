"use server";

import { revalidatePath } from "next/cache";

import { generateInsights } from "@/lib/insights/generate";

/**
 * Server action for the analytics page. Auth, the minimum-history check, the
 * Claude call, and the service-role insert all live in lib/insights/generate
 * (which re-verifies the session itself — this action is reachable by direct
 * POST); this wrapper only adapts it to the useActionState signature and
 * refreshes the page so the new report renders.
 */

export type InsightActionResult = { ok: boolean; error?: string };

export async function generateInsightsAction(
  _prev: InsightActionResult,
  formData: FormData,
): Promise<InsightActionResult> {
  // The form carries no fields — the signature exists for useActionState.
  void formData;
  const result = await generateInsights();
  if (result.ok) revalidatePath("/dashboard/analytics");
  return result;
}
