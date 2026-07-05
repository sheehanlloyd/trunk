import * as cheerio from "cheerio";

import { type CleanedSite, ScrapeError } from "@/lib/onboarding/types";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000; // ~2 MB cap on downloaded HTML
const MIN_USEFUL_CHARS = 200; // below this, extraction isn't worth attempting
const MAX_EXTRA_PAGES = 3; // enrich the main page with a few internal links
const USER_AGENT =
  "Mozilla/5.0 (compatible; AIReceptionistOnboarding/1.0; +https://example.com/bot)";

/** Same-origin paths worth pulling in to enrich thin landing pages. */
const ENRICH_KEYWORDS = ["service", "about", "contact", "pricing", "price", "rates"];

/** Normalizes user input into an absolute http(s) URL, or throws invalid_url. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ScrapeError("invalid_url", "No URL provided.");

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ScrapeError("invalid_url", "That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ScrapeError("invalid_url", "Only http and https URLs are supported.");
  }
  return parsed.toString();
}

/** Fetches a single URL as text, mapping network/HTTP failures to ScrapeError. */
async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ScrapeError("timeout", "The site took too long to respond.");
    }
    throw new ScrapeError("network", "Could not reach the site.");
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new ScrapeError("blocked", "The site blocked our request.");
  }
  if (res.status === 404 || res.status === 410) {
    throw new ScrapeError("not_found", "That page could not be found.");
  }
  if (!res.ok) {
    throw new ScrapeError("network", `The site returned an error (${res.status}).`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !/(text\/html|application\/xhtml)/i.test(contentType)) {
    throw new ScrapeError(
      "too_little_content",
      "That URL isn't an HTML page we can read.",
    );
  }

  // Guard against pathologically large documents.
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return new TextDecoder().decode(buf.slice(0, MAX_BYTES));
  }
  return new TextDecoder().decode(buf);
}

/** Extracts cleaned visible text (nav/footer/scripts removed) from HTML. */
function extractVisibleText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();
  const text = $("body").text();
  return text.replace(/\s+/g, " ").trim();
}

/** Finds up to N same-origin links whose href/text hints at useful content. */
function findEnrichmentLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const found = new Set<string>();

  $("a[href]").each((_, el) => {
    if (found.size >= MAX_EXTRA_PAGES) return;
    const href = $(el).attr("href") ?? "";
    const label = ($(el).text() ?? "").toLowerCase();
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (new URL(abs).origin !== origin) return;
    if (abs.split("#")[0] === baseUrl.split("#")[0]) return;

    const haystack = `${abs.toLowerCase()} ${label}`;
    if (ENRICH_KEYWORDS.some((k) => haystack.includes(k))) {
      found.add(abs.split("#")[0]);
    }
  });

  return [...found];
}

/**
 * Fetches a business site and returns cleaned, structured text ready for LLM
 * extraction. Best-effort enriches the landing page with a few internal pages
 * (services/about/contact). Throws {@link ScrapeError} on clear failure states.
 */
export async function fetchAndClean(rawUrl: string): Promise<CleanedSite> {
  const url = normalizeUrl(rawUrl);

  const mainHtml = await fetchHtml(url);
  const $ = cheerio.load(mainHtml);
  const title = ($("title").first().text() ?? "").replace(/\s+/g, " ").trim();
  const metaDescription = $('meta[name="description"]').attr("content") ?? "";

  const parts: string[] = [];
  if (metaDescription.trim()) parts.push(metaDescription.trim());
  parts.push(extractVisibleText($));

  // Enrich with a few internal pages. Failures here are non-fatal.
  const links = findEnrichmentLinks(cheerio.load(mainHtml), url);
  for (const link of links) {
    try {
      const html = await fetchHtml(link);
      const $$ = cheerio.load(html);
      const extra = extractVisibleText($$);
      if (extra) parts.push(`\n\n[From ${link}]\n${extra}`);
    } catch {
      // Ignore enrichment failures — the main page is what matters.
    }
  }

  const text = parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

  if (text.length < MIN_USEFUL_CHARS) {
    throw new ScrapeError(
      "too_little_content",
      "There wasn't enough readable text on this site to build a draft. " +
        "The site may rely on JavaScript or images. You can enter the details manually.",
    );
  }

  return { url, title, text };
}
