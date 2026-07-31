"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 to `value` when scrolled into view — used by the stat band.
 * Formats with the provided prefix/suffix; reduced-motion users get the final
 * value immediately.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  durationMs = 1400,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Starts at the FINAL value so the server-rendered HTML is truthful — with
  // JS off (or before hydration) the band must not read "$0". The client
  // rewinds to 0 on mount, one frame before the animation begins.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        // Rewind here rather than on mount: the value stays truthful until the
        // moment it's actually about to animate into view.
        setDisplay(0);
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / durationMs, 1);
          // ease-out cubic so the count settles rather than slams.
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(Math.round(value * eased));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}
