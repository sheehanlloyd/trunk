/**
 * Manual end-to-end check for the onboarding pipeline (task item 6).
 *
 * Runs one or more real business URLs through the full flow:
 *   fetchAndClean  ->  extractDraft (Claude)  ->  buildSystemPrompt
 * and prints the structured draft plus the generated system prompt so you can
 * eyeball that they're accurate and business-specific. Nothing is saved.
 *
 * Usage:
 *   npm run test:onboarding                 # uses the default URLs below
 *   npm run test:onboarding -- https://a.com https://b.com
 *
 * Requires ANTHROPIC_API_KEY (loaded from .env.local if present).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Minimal .env.local loader (tsx doesn't load env files like Next does) ---
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

loadEnvLocal();

const DEFAULT_URLS = [
  "https://www.rotorooter.com",
  "https://www.mollymaid.com",
  "https://www.trugreen.com",
];

async function main(): Promise<void> {
  // Import after env is loaded so serverEnv getters see the API key.
  const { fetchAndClean } = await import("@/lib/onboarding/scrape");
  const { extractDraft } = await import("@/lib/onboarding/extract");
  const { buildSystemPrompt } = await import("@/lib/ai/systemPrompt");
  const { ScrapeError } = await import("@/lib/onboarding/types");
  type Business = import("@/lib/types/database").Business;

  const urls = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_URLS;

  for (const url of urls) {
    console.log("\n" + "=".repeat(78));
    console.log(`URL: ${url}`);
    console.log("=".repeat(78));

    try {
      const site = await fetchAndClean(url);
      console.log(
        `\n[scrape] title="${site.title}"  text=${site.text.length} chars`,
      );

      const draft = await extractDraft(site);
      console.log("\n[draft]");
      console.log(JSON.stringify(draft, null, 2));

      // buildSystemPrompt only reads name/service_area/services/hours/
      // emergency_policy, so a partial Business is sufficient here.
      const business = {
        name: draft.name,
        service_area: draft.service_area,
        services: draft.services,
        hours: draft.hours,
        emergency_policy: draft.emergency_policy,
      } as Business;

      console.log("\n[system prompt]");
      console.log(buildSystemPrompt(business));
    } catch (err) {
      if (err instanceof ScrapeError) {
        console.error(`\n[scrape failed: ${err.reason}] ${err.message}`);
      } else {
        console.error("\n[error]", err);
      }
    }
  }

  console.log("\n" + "=".repeat(78));
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
