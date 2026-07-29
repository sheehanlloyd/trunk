import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { generateInsightsForBusiness, shouldRegenerate } from "@/lib/insights/generate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessStatus } from "@/lib/types/database";

export const runtime = "nodejs";

/**
 * Long by route standards, because each report is a full Claude read of ~100
 * transcripts. The per-run cap below is sized so a run finishes inside this.
 */
export const maxDuration = 300;

/**
 * POST /api/insights/weekly — the weekly AI-insights sweep.
 *
 * Until this existed, insights only appeared if an owner remembered to press
 * "Generate insights", which meant the feature quietly did nothing for the
 * people who most needed it. Now every serving tenant gets a fresh report on a
 * schedule and simply finds it waiting on the analytics page.
 *
 * Guarded by the shared CRON_SECRET, same as the other two daily jobs.
 *
 * Safe to re-run: a business whose newest report is younger than
 * MIN_REGENERATE_DAYS is skipped, so a double-fire (or a manual retry after a
 * partial run) costs nothing in tokens rather than duplicating reports.
 *
 * Bounded by design: at most MAX_PER_RUN businesses per invocation, processed
 * CONCURRENCY at a time. The response reports `remaining` when the cap bites so
 * a truncated sweep is visible in the scheduler's logs rather than silently
 * looking like a complete one.
 */

/** Businesses that are actually serving customers. Paused/canceled are skipped. */
const SERVING_STATUSES: BusinessStatus[] = ["trial", "active", "past_due"];

/** Ceiling per invocation, sized against `maxDuration` above. */
const MAX_PER_RUN = 12;
/** Reports generated in parallel. Kept low — each is a large model call. */
const CONCURRENCY = 4;

interface Candidate {
  id: string;
  name: string;
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name")
    .in("status", SERVING_STATUSES)
    .returns<Candidate[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();

  // Find each tenant's newest report in one query rather than N. At this
  // product's scale the insights table is small (one row per business per
  // week), so pulling created_at and reducing in code beats a per-row round
  // trip — and keeps the whole sweep to two queries before any model call.
  const { data: latest, error: latestError } = await supabase
    .from("insights")
    .select("business_id, created_at")
    .order("created_at", { ascending: false })
    .returns<{ business_id: string; created_at: string }[]>();

  if (latestError) {
    return NextResponse.json({ error: latestError.message }, { status: 500 });
  }

  const newestByBusiness = new Map<string, string>();
  for (const row of latest ?? []) {
    // Rows arrive newest-first, so the first sighting of a business wins.
    if (!newestByBusiness.has(row.business_id)) {
      newestByBusiness.set(row.business_id, row.created_at);
    }
  }

  const due = (businesses ?? []).filter((b) =>
    shouldRegenerate(newestByBusiness.get(b.id) ?? null, now),
  );
  const skippedRecent = (businesses ?? []).length - due.length;

  const batch = due.slice(0, MAX_PER_RUN);
  const remaining = due.length - batch.length;

  let generated = 0;
  // Businesses without enough history yet, or whose model call failed. Not an
  // error for the sweep as a whole — one quiet tenant must not fail the run.
  const skippedNoData: string[] = [];
  const failed: { business: string; error: string }[] = [];

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const slice = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (business) => {
        try {
          const result = await generateInsightsForBusiness(business.id, supabase);
          return { business, result };
        } catch (err) {
          return {
            business,
            result: {
              ok: false,
              error: err instanceof Error ? err.message : "Unknown error.",
            },
          };
        }
      }),
    );

    for (const { business, result } of results) {
      if (result.ok) {
        generated += 1;
      } else if (result.error?.startsWith("Not enough conversation history")) {
        skippedNoData.push(business.name);
      } else {
        failed.push({ business: business.name, error: result.error ?? "Unknown." });
      }
    }
  }

  if (remaining > 0) {
    console.warn(
      `[insights:weekly] run capped at ${MAX_PER_RUN}; ${remaining} business(es) still due.`,
    );
  }
  for (const f of failed) {
    console.error(`[insights:weekly] ${f.business}: ${f.error}`);
  }

  return NextResponse.json({
    generated,
    skippedRecent,
    skippedNoData: skippedNoData.length,
    failed: failed.length,
    remaining,
  });
}
