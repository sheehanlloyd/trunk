"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copies a conversation transcript to the clipboard as plain text. The server
 * component builds the full text (business name + date header, then one
 * "Customer:/Receptionist:" line per turn) and passes it down — this stays a
 * dumb button with a 2-second "Copied" confirmation.
 */
export function CopyTranscriptButton({ transcript }: { transcript: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Don't let a pending "Copied" reset fire after unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — leave the
      // button as-is rather than showing a false success.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
        (copied ? "text-revenue-700" : "text-ink-700")
      }
    >
      {copied ? "✓ Copied" : "Copy transcript"}
    </button>
  );
}
