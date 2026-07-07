import { NextResponse } from "next/server";

import { getOperator } from "@/lib/auth/operator";
import { extractDraft } from "@/lib/onboarding/extract";
import { fetchAndClean } from "@/lib/onboarding/scrape";
import { ScrapeError } from "@/lib/onboarding/types";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/onboarding/scrape
 * Body: { url: string }
 *
 * Operator-only. Scrapes the given site, extracts a structured draft, and
 * returns it for review. Saves nothing. Maps scrape failures to clear 4xx
 * states so the UI can show actionable errors instead of silent failures.
 */
export async function POST(request: Request) {
  const operator = await getOperator();
  if (!operator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // Each call does an outbound fetch of an arbitrary URL plus an LLM
  // extraction pass — cap how fast one operator can run those up.
  const limit = rateLimit(`onboarding:scrape:${operator.email}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many scrape requests — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json({ error: "A url is required." }, { status: 400 });
  }

  // Tracked outside the try so the catch block can still hand back whatever
  // was recovered before the failure (see below).
  let site: Awaited<ReturnType<typeof fetchAndClean>> | null = null;
  try {
    site = await fetchAndClean(url);
    const draft = await extractDraft(site);
    return NextResponse.json({
      draft,
      sourceUrl: site.url,
      rawScrapedContent: site.text,
    });
  } catch (err) {
    if (err instanceof ScrapeError) {
      // Scraping itself never got off the ground (bad/unreachable/blocked/thin
      // URL) — nothing was recovered, but the UI still lets the operator
      // proceed to manual entry (see sourceUrl/rawScrapedContent below).
      const status = err.reason === "invalid_url" ? 400 : 422;
      return NextResponse.json(
        {
          error: err.message,
          reason: err.reason,
          sourceUrl: url,
          rawScrapedContent: "",
        },
        { status },
      );
    }
    console.error("[onboarding/scrape] extraction failed", err);
    // Manual-entry fallback (audit fix, item 3): extraction (the AI step) is
    // the one part of this pipeline that can fail for reasons that have
    // nothing to do with the operator's input — a rate limit, a timeout, a
    // provider outage — and it must never fully block onboarding. Hand back
    // whatever scraping DID recover (the raw page text + normalized URL, when
    // `fetchAndClean` succeeded) so the operator can proceed straight to the
    // same review/edit form and fill in the details by hand instead of being
    // stuck with only an error banner and no way forward.
    return NextResponse.json(
      {
        error:
          "We scraped the site but couldn't build a draft automatically. Enter the business details manually below.",
        reason: "extraction_failed",
        sourceUrl: site?.url ?? url,
        rawScrapedContent: site?.text ?? "",
      },
      { status: 502 },
    );
  }
}
