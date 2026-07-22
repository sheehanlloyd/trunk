"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** How often to re-fetch the page's server data while the tab is visible. */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Keeps the dashboard current without the owner ever reloading: a subtle "Live"
 * chip that silently calls router.refresh() every minute. Refreshing only
 * re-renders the server components and merges the payload, so client state and
 * scroll position survive — no layout shift, no spinner.
 *
 * The interval runs only while the tab is visible (no wasted requests from a
 * backgrounded tab); on return to a visible tab we refresh immediately if a
 * full interval has already elapsed, so the owner never looks at stale numbers.
 */
export function LiveRefresh() {
  const router = useRouter();
  // When data was last fetched — stamped in the effect at mount (render must
  // stay pure), since the server just rendered fresh data to get us here.
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    lastRefreshAt.current = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      lastRefreshAt.current = Date.now();
      router.refresh();
    };

    const start = () => {
      if (timer == null) timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Catch up right away if the tab sat hidden past a full interval.
        if (Date.now() - lastRefreshAt.current >= REFRESH_INTERVAL_MS) refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted"
      title="Updates automatically every minute"
    >
      <span aria-hidden className="relative flex h-2 w-2">
        {/* Soft ping halo; hidden for reduced-motion users (dot alone suffices). */}
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-revenue-500 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-revenue-600" />
      </span>
      Live
    </span>
  );
}
