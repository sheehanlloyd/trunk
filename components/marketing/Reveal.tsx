"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Scroll-reveal wrapper for the marketing page. Children start translated +
 * transparent (`.reveal` in globals.css) and animate in the first time they
 * enter the viewport. One observer per element is fine at this page's scale;
 * reduced-motion users see content immediately via the CSS override.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Stagger offset in ms, applied via transition-delay. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal-in");
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
