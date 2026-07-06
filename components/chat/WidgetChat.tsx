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
}

/** Message the loader listens for to resize the iframe. */
function notifyParent(action: "open" | "close") {
  try {
    window.parent?.postMessage({ source: "air-widget", action }, "*");
  } catch {
    // Cross-origin parent without a listener — safe to ignore.
  }
}

export function WidgetChat({ businessId, businessName }: WidgetChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const greeting = `Hi! Thanks for reaching out to ${businessName}. How can I help you today?`;

  const openPanel = useCallback(() => {
    setOpen(true);
    notifyParent("open");
    setMessages((prev) =>
      prev.length === 0 ? [{ role: "assistant", text: greeting }] : prev,
    );
  }, [greeting]);

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
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="flex h-dvh w-full items-end justify-end p-3">
        <button
          type="button"
          onClick={openPanel}
          aria-label="Open chat"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <ChatIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--color-surface)] shadow-2xl sm:rounded-2xl sm:border sm:border-[var(--color-border)]">
      {/* Header */}
      <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{businessName}</p>
          <p className="text-xs text-brand-100">We typically reply in a moment</p>
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
          <MessageBubble key={i} role={m.role} text={m.text} />
        ))}
        {loading && <TypingIndicator />}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
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
          className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ role, text }: Message) {
  const isCustomer = role === "customer";
  return (
    <div className={isCustomer ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm " +
          (isCustomer
            ? "bg-brand-600 text-white"
            : "border border-[var(--color-border)] bg-[var(--color-surface)] text-slate-800")
        }
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
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
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
