"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Top navigation for the marketing page. Sits over the dark hero, so it's
 * white-on-petrol; sticky with a blur once you scroll. Mobile gets a simple
 * disclosure menu — no drawer machinery for four links.
 */

const LINKS = [
  { href: "#product", label: "See it work" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
] as const;

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-paper/10 bg-ink-900/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded bg-paper text-[13px] font-semibold text-ink-900"
          >
            T
          </span>
          <span className="text-[17px] font-medium tracking-tight text-paper">
            Trunk
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-ink-300 transition-colors hover:text-paper"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-ink-300 transition-colors hover:text-paper"
          >
            Log in
          </Link>
          <a
            href="#pricing"
            className="rounded-md bg-paper px-4 py-2 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
          >
            Get your number
          </a>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-ink-300 hover:text-paper md:hidden"
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
      </div>

      {open && (
        <div className="border-t border-paper/10 px-5 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-ink-300 hover:text-paper"
              >
                {l.label}
              </a>
            ))}
            <Link href="/login" className="text-sm font-medium text-ink-300 hover:text-paper">
              Log in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
