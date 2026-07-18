"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/utils";

/**
 * Dashboard navigation. The design doc capped v1 at five destinations; the
 * v2/v3 feature set earns more, so the rail groups them under quiet section
 * labels instead of growing one long undifferentiated list. Icons are inline
 * SVG paths (stroke inherits currentColor) — no icon library.
 */

interface NavItem {
  href: string;
  label: string;
  exact: boolean;
  /** SVG path data for a 24×24 1.75-stroke icon. */
  icon: string;
}

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        exact: true,
        icon: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
      },
    ],
  },
  {
    label: "Work",
    items: [
      {
        href: "/dashboard/conversations",
        label: "Conversations",
        exact: false,
        icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
      },
      {
        href: "/dashboard/bookings",
        label: "Bookings",
        exact: false,
        icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 12 2 2 4-4",
      },
      {
        href: "/dashboard/leads",
        label: "Leads",
        exact: false,
        icon: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
      },
      {
        href: "/dashboard/activity",
        label: "Activity",
        exact: false,
        icon: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Zm-4.3 13a2 2 0 0 1-3.4 0",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        href: "/dashboard/analytics",
        label: "Analytics",
        exact: false,
        icon: "M3 3v18h18M7 16l4-4 4 4 5-6",
      },
      {
        href: "/dashboard/reports",
        label: "Reports",
        exact: false,
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 13h6M9 17h6",
      },
    ],
  },
  {
    label: "Manage",
    items: [
      {
        href: "/dashboard/settings",
        label: "Knowledge & Settings",
        exact: false,
        icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z",
      },
      {
        href: "/dashboard/billing",
        label: "Billing",
        exact: false,
        icon: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 3h20M6 15h4",
      },
    ],
  },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

/** Opens the ⌘K palette (CommandPalette listens for this window event). */
function SearchPill() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("command-palette:open"))}
      className="mb-5 flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-400 transition-[border-color,color] duration-150 hover:border-border-strong hover:text-ink-600"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="h-4 w-4"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border border-border bg-ink-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-ink-400">
        ⌘K
      </kbd>
    </button>
  );
}

interface NavBarProps {
  businessName: string;
  userEmail: string;
}

export function NavBar({ businessName, userEmail }: NavBarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  const links = (
    <nav className="flex flex-col gap-0.5">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.label ?? gi} className={gi > 0 ? "mt-4" : undefined}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-400">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13.5px] font-medium transition-[background-color,color] duration-150",
                  active
                    ? "bg-ink-100 text-ink-900"
                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                )}
              >
                {/* Active marker: a short ink bar on the left edge, the
                    convention Linear-style rails use instead of a full fill. */}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-ink-900"
                  />
                ) : null}
                <span
                  className={cn(
                    "transition-colors",
                    active ? "text-ink-900" : "text-ink-400 group-hover:text-ink-600",
                  )}
                >
                  <NavIcon path={item.icon} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="min-w-0">
      <p className="truncate text-[13.5px] font-semibold text-ink-900">
        {businessName}
      </p>
      <p className="truncate text-xs text-muted">{userEmail}</p>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        {brand}
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-ink-600 hover:bg-ink-100"
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
      </header>
      {open && (
        <div className="border-b border-border bg-surface px-4 py-3 md:hidden">
          {links}
          <div className="mt-3 border-t border-border pt-3">
            <LogoutButton />
          </div>
        </div>
      )}

      {/* Desktop left rail */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="flex items-center gap-2.5 px-1 pb-5 pt-1">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-900 font-display text-[13px] font-semibold text-[#fefefe]"
          >
            T
          </span>
          <p className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
            Trunk
          </p>
        </div>
        <div className="mb-3 rounded-md border border-border bg-ink-50 p-3">
          {brand}
        </div>
        <SearchPill />
        <div className="-mx-1 flex-1 overflow-y-auto px-1">{links}</div>
        <div className="mt-3 border-t border-border pt-3">
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
