"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/utils";

/** The five (and only five) dashboard destinations from the design doc. */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/conversations", label: "Conversations", exact: false },
  { href: "/dashboard/bookings", label: "Bookings", exact: false },
  { href: "/dashboard/settings", label: "Knowledge & Settings", exact: false },
  { href: "/dashboard/billing", label: "Billing", exact: false },
] as const;

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
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(item.href, item.exact)
              ? "bg-brand-50 text-brand-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const brand = (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-900">
        {businessName}
      </p>
      <p className="truncate text-xs text-[--color-muted]">{userEmail}</p>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-[--color-border] bg-[--color-surface] px-4 py-3 md:hidden">
        {brand}
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
      </header>
      {open && (
        <div className="border-b border-[--color-border] bg-[--color-surface] px-4 py-3 md:hidden">
          {links}
          <div className="mt-3 border-t border-[--color-border] pt-3">
            <LogoutButton />
          </div>
        </div>
      )}

      {/* Desktop left rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[--color-border] bg-[--color-surface] p-4 md:flex">
        <div className="px-1 pb-4">
          <p className="text-lg font-bold text-brand-700">AI Receptionist</p>
        </div>
        <div className="mb-4 rounded-lg bg-slate-50 p-3">{brand}</div>
        {links}
        <div className="mt-auto border-t border-[--color-border] pt-3">
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
