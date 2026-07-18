"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  searchEverything,
  type SearchResult,
} from "@/app/dashboard/search-actions";
import { cn } from "@/lib/utils";

/**
 * Global ⌘K command palette. Self-contained: renders its own overlay and
 * window-level keyboard listener, so mounting `<CommandPalette />` once in the
 * dashboard layout is all that's needed. Static navigation commands are always
 * available; typing 2+ characters also searches conversations, bookings, and
 * leads through the `searchEverything` server action (debounced 250ms).
 */

const OPEN_EVENT = "command-palette:open";

interface NavCommand {
  label: string;
  href: string;
  /** Extra match terms beyond the label, e.g. "home" for Dashboard. */
  keywords?: string;
}

const NAV_COMMANDS: NavCommand[] = [
  { label: "Dashboard", href: "/dashboard", keywords: "home overview" },
  { label: "Conversations", href: "/dashboard/conversations", keywords: "chats calls transcripts" },
  { label: "Bookings", href: "/dashboard/bookings", keywords: "appointments jobs schedule" },
  { label: "Leads", href: "/dashboard/leads", keywords: "missed follow up" },
  { label: "Analytics", href: "/dashboard/analytics", keywords: "stats metrics reports" },
  { label: "Activity", href: "/dashboard/activity", keywords: "feed history log" },
  { label: "Knowledge", href: "/dashboard/knowledge", keywords: "corrections answers" },
  { label: "Settings", href: "/dashboard/settings", keywords: "business hours services" },
  { label: "Billing", href: "/dashboard/billing", keywords: "subscription payment invoice" },
];

/** Substring match, falling back to in-order subsequence ("cnv" → Conversations). */
function fuzzyMatch(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return true;
  if (h.includes(n)) return true;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i += 1;
    if (i === n.length) return true;
  }
  return false;
}

const SECTION_LABELS: Record<SearchResult["type"], string> = {
  conversation: "Conversations",
  booking: "Bookings",
  lead: "Leads",
};

/** One flat, keyboard-navigable entry (nav command or search hit). */
interface PaletteItem {
  key: string;
  section: string;
  title: string;
  subtitle?: string;
  href: string;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-ink-50 px-1.5 py-0.5 font-sans text-xs text-ink-500">
      {children}
    </kbd>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Monotonic id so a stale debounce/response can never clobber newer results. */
  const searchSeq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setEntered(false);
  }, []);

  const openPalette = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearching(false);
    setActiveIndex(0);
    setOpen(true);
  }, []);

  // Global shortcuts. ⌘K/Ctrl+K toggles even while typing in an input (standard
  // palette behavior); nothing else is intercepted, so plain typing is untouched.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((wasOpen) => {
          if (wasOpen) {
            setEntered(false);
            return false;
          }
          setQuery("");
          setResults([]);
          setSearching(false);
          setActiveIndex(0);
          return true;
        });
      }
    }
    function onOpenEvent() {
      openPalette();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, [openPalette]);

  // Enter animation (opacity/scale) + focus + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /** Input handler owns the sync state flips (clear vs. pending) so the search
   *  effect only schedules the debounce timer. */
  function onQueryChange(next: string) {
    setQuery(next);
    setActiveIndex(0);
    if (next.trim().length < 2) {
      searchSeq.current += 1; // invalidate any in-flight search
      setResults([]);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  // Debounced async search (250ms) once the query is 2+ characters.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const hits = await searchEverything(trimmed);
        if (searchSeq.current === seq) {
          setResults(hits);
          setSearching(false);
        }
      } catch {
        if (searchSeq.current === seq) {
          setResults([]);
          setSearching(false);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);

  // Flat item list: filtered nav commands first, then grouped search hits.
  const items = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = NAV_COMMANDS.filter((c) =>
      fuzzyMatch(`${c.label} ${c.keywords ?? ""}`, query),
    ).map((c) => ({
      key: `nav-${c.href}`,
      section: "Go to",
      title: c.label,
      href: c.href,
    }));

    const hits: PaletteItem[] = results.map((r) => ({
      key: `${r.type}-${r.id}`,
      section: SECTION_LABELS[r.type],
      title: r.title,
      subtitle: r.subtitle,
      href: r.href,
    }));

    return [...nav, ...hits];
  }, [query, results]);

  // Clamp at render time (no state write) so the active row stays valid as
  // async results shrink or grow the list.
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0));

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const select = useCallback(
    (item: PaletteItem) => {
      close();
      router.push(item.href);
    },
    [close, router],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(items.length ? (active + 1) % items.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(
        items.length ? (active - 1 + items.length) % items.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) select(item);
    }
  }

  if (!open) return null;

  // Group consecutive items by section for headers while keeping flat indexes.
  let lastSection: string | null = null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-ink-900/20 backdrop-blur-sm transition-opacity duration-150",
        entered ? "opacity-100" : "opacity-0",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={cn(
          "mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-raised transition-all duration-150",
          entered ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4 shrink-0 text-ink-400"
          >
            <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m13.5 13.5 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search or jump to…"
            aria-label="Search commands, conversations, bookings, and leads"
            className="h-12 w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 && !searching ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              No results for “{query.trim()}”
            </p>
          ) : (
            items.map((item, index) => {
              const header =
                item.section !== lastSection ? item.section : null;
              lastSection = item.section;
              return (
                <div key={item.key}>
                  {header ? (
                    <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                      {header}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-index={index}
                    onClick={() => select(item)}
                    onMouseMove={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left",
                      index === active ? "bg-brand-50" : "bg-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        index === active ? "text-brand-700" : "text-ink-900",
                      )}
                    >
                      {item.title}
                    </span>
                    {item.subtitle ? (
                      <span className="shrink-0 text-xs text-muted">
                        {item.subtitle}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
          {searching ? (
            <p className="px-3 py-2 text-xs text-muted">Searching…</p>
          ) : null}
        </div>

        <div className="flex items-center gap-4 border-t border-border bg-ink-50/50 px-4 py-2.5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Optional visible trigger for the palette — a subtle pill that opens it via a
 * window event, so it works from anywhere without prop-drilling.
 */
export function CommandPaletteHint({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted shadow-card transition-colors hover:bg-ink-50",
        className,
      )}
    >
      <span>Search</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}
