import type { ServiceItem } from "@/lib/types/database";

/**
 * Structured draft of a business, produced by scraping + LLM extraction and
 * reviewed by the operator before anything is saved. Fields mirror the editable
 * columns on `businesses`, plus `contact` (helper info shown to the operator)
 * and `warnings` (extraction caveats surfaced in the review UI).
 */
export interface OnboardingDraft {
  /** Business name as it should appear to customers. */
  name: string;
  /** Free-text service area (city/region/radius). */
  service_area: string;
  /** Services with optional description and price range. */
  services: ServiceItem[];
  /** Map of weekday -> hours string, e.g. { monday: "8am–6pm" }. */
  hours: Record<string, string>;
  /** How after-hours emergencies should be handled. */
  emergency_policy: string;
  /** Contact details scraped from the site — suggestions only, operator confirms. */
  contact: {
    phone?: string;
    email?: string;
    address?: string;
  };
  /** Human-readable caveats about low-confidence or missing data. */
  warnings: string[];
}

/** Reasons a scrape can fail, surfaced verbatim to the onboarding UI. */
export type ScrapeFailureReason =
  | "invalid_url"
  | "blocked"
  | "not_found"
  | "timeout"
  | "network"
  | "too_little_content";

/** Typed error thrown by the scraper so callers can map to clear UI states. */
export class ScrapeError extends Error {
  reason: ScrapeFailureReason;
  constructor(reason: ScrapeFailureReason, message: string) {
    super(message);
    this.name = "ScrapeError";
    this.reason = reason;
  }
}

/** Cleaned, structured output of the scrape step (before LLM extraction). */
export interface CleanedSite {
  /** Source URL actually fetched (normalized). */
  url: string;
  /** Page <title>, if any. */
  title: string;
  /** Concatenated visible text from the main page + any enriched pages. */
  text: string;
}
