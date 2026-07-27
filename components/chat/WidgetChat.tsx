"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * The customer-facing chat interface. Renders a floating bubble that expands
 * into a conversation panel. It lives inside the widget iframe (served from our
 * origin), so its `fetch('/api/chat')` calls are same-origin. Opening/closing
 * posts a message to the parent loader (`public/widget.js`) so it can resize the
 * iframe — the bubble stays small when collapsed and can't block the host page.
 */

interface Message {
  role: "customer" | "assistant";
  text: string;
}

interface WidgetChatProps {
  businessId: string;
  businessName: string;
  /** Owner-chosen accent hex (validated server-side); brand tokens when unset. */
  accentColor?: string;
  /** Owner-written first message; falls back to the stock greeting. */
  greeting?: string;
  /** Which corner the loader should anchor the iframe to; default right. */
  position?: "right" | "left";
  /** Owner opt-in: show a greeting teaser card beside the collapsed launcher. */
  teaser?: boolean;
}

/**
 * Once the visitor has dismissed the teaser — or opened the chat at all — we
 * stay quiet for the rest of the tab session. sessionStorage can throw inside
 * sandboxed iframes, so every touch is guarded; storage failure = show nothing
 * fancy, never crash the widget.
 */
const TEASER_SEEN_KEY = "air-widget-teaser-seen";

function teaserSeen(): boolean {
  try {
    return window.sessionStorage.getItem(TEASER_SEEN_KEY) === "1";
  } catch {
    // Storage unavailable (sandboxed iframe / privacy mode): treat as seen so
    // the teaser can't re-appear on every navigation with no way to silence it.
    return true;
  }
}

function markTeaserSeen() {
  try {
    window.sessionStorage.setItem(TEASER_SEEN_KEY, "1");
  } catch {
    // Best effort only.
  }
}

/** How long the visitor browses before the teaser slides in. */
const TEASER_DELAY_MS = 5000;

/** Message the loader listens for to resize the iframe. */
function notifyParent(action: "open" | "close") {
  try {
    window.parent?.postMessage({ source: "air-widget", action }, "*");
  } catch {
    // Cross-origin parent without a listener — safe to ignore.
  }
}

/**
 * Tells the loader (public/widget.js) which corner the owner chose. The loader
 * can't read our config itself — the frame is the only party that saw the DB —
 * so we announce it once on mount and it applies the left/right CSS.
 */
function notifyParentConfig(position: "right" | "left") {
  try {
    window.parent?.postMessage(
      { source: "air-widget", type: "config", position },
      "*",
    );
  } catch {
    // Cross-origin parent without a listener — safe to ignore.
  }
}

/**
 * Tells the loader the teaser card just appeared/disappeared so it can grow
 * the collapsed iframe to fit and shrink it back on dismiss.
 */
function notifyParentTeaser(visible: boolean) {
  try {
    window.parent?.postMessage(
      { source: "air-widget", type: "teaser", visible },
      "*",
    );
  } catch {
    // Cross-origin parent without a listener — safe to ignore.
  }
}

export function WidgetChat({
  businessId,
  businessName,
  accentColor,
  greeting: customGreeting,
  position = "right",
  teaser = false,
}: WidgetChatProps) {
  const [open, setOpen] = useState(false);
  const [teaserVisible, setTeaserVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const greeting =
    customGreeting?.trim() ||
    `Hi! Thanks for reaching out to ${businessName}. How can I help you today?`;

  /** Inline accent override; undefined keeps the token classes as-is. */
  const accentStyle = accentColor ? { backgroundColor: accentColor } : undefined;

  // Announce the configured corner to the loader once per mount.
  useEffect(() => {
    notifyParentConfig(position);
  }, [position]);

  // Owner-enabled teaser: after a short browse, surface the greeting next to
  // the launcher — but only while collapsed, and never again once the visitor
  // has opened the chat or dismissed the card this session.
  useEffect(() => {
    if (!teaser || open || teaserSeen()) return;
    const timer = window.setTimeout(() => {
      setTeaserVisible(true);
      notifyParentTeaser(true);
    }, TEASER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [teaser, open]);

  const hideTeaser = useCallback(() => {
    markTeaserSeen();
    setTeaserVisible(false);
    notifyParentTeaser(false);
  }, []);

  const openPanel = useCallback(() => {
    // Opening counts as "seen": shrink the loader's collapsed size back down
    // so closing later returns to the bare bubble.
    hideTeaser();
    setOpen(true);
    notifyParent("open");
    setMessages((prev) =>
      prev.length === 0 ? [{ role: "assistant", text: greeting }] : prev,
    );
  }, [greeting, hideTeaser]);

  const closePanel = useCallback(() => {
    setOpen(false);
    notifyParent("close");
  }, []);

  // Keep the latest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "customer", text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, message: text, conversationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply ?? "" },
      ]);
    } catch {
      setError("Hmm, that didn't go through — mind trying again?");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    const alignEnd = position === "left" ? "items-start" : "items-end";
    return (
      <div
        className={
          "flex h-dvh w-full flex-col justify-end gap-2 p-3 " + alignEnd
        }
      >
        {teaserVisible ? (
          <div className="msg-in relative max-w-[220px]">
            <button
              type="button"
              onClick={openPanel}
              className="block w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-left shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className="line-clamp-2 text-sm leading-snug text-ink-800">
                {greeting}
              </span>
            </button>
            <button
              type="button"
              onClick={hideTeaser}
              aria-label="Dismiss message preview"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-ink-500 shadow hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <TeaserCloseIcon />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={openPanel}
          aria-label="Open chat"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          style={accentStyle}
        >
          <ChatIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--color-surface)] shadow-2xl sm:rounded-2xl sm:border sm:border-[var(--color-border)]">
      {/* Header */}
      <div
        className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white"
        style={accentStyle}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {businessName.trim().charAt(0) || "A"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{businessName}</p>
            <p className="flex items-center gap-1.5 text-xs text-brand-100">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-revenue-200"
              />
              We typically reply in a moment
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close chat"
          className="rounded-full p-1 text-white/90 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto bg-[var(--color-background)] px-4 py-4"
      >
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            role={m.role}
            text={m.text}
            accentColor={accentColor}
          />
        ))}
        {loading && <TypingIndicator />}
        {error && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl border border-copper-200 bg-copper-50 px-3.5 py-2 text-sm text-copper-700">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={sendMessage}
        className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message…"
          aria-label="Message"
          className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          style={accentStyle}
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  role,
  text,
  accentColor,
}: Message & { accentColor?: string }) {
  const isCustomer = role === "customer";
  return (
    <div className={isCustomer ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm " +
          (isCustomer
            ? "bg-brand-600 text-white"
            : "border border-[var(--color-border)] bg-[var(--color-surface)] text-ink-800")
        }
        // Customer bubbles share the accent so a custom color feels cohesive.
        style={isCustomer && accentColor ? { backgroundColor: accentColor } : undefined}
      >
        {text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400"
      style={{ animationDelay: delay }}
    />
  );
}

function ChatIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c5 0 9 3.4 9 7.5S17 18 12 18c-1 0-2-.1-2.9-.4L4 19l1.2-3.3C3.8 14.4 3 12.6 3 10.5 3 6.4 7 3 12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TeaserCloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12 20 4l-3.5 16-4.5-6-8-2Z"
        fill="currentColor"
      />
    </svg>
  );
}
