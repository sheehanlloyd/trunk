"use client";

import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";

import { askTestQuestion } from "@/app/dashboard/knowledge/actions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";
import type { ConversationTurn } from "@/lib/types/database";

/** One rendered turn; flags only ever accompany an assistant reply. */
interface TestMessage extends ConversationTurn {
  flags?: string[];
}

/**
 * Chip color by signal: copper for emergencies (attention), revenue for
 * bookings (money), ink for everything informational — mirroring the palette
 * rules used across the dashboard.
 */
function flagClasses(flag: string): string {
  if (flag.toLowerCase().includes("emergency")) {
    return "bg-copper-50 text-copper-700";
  }
  if (flag.toLowerCase().includes("booking")) {
    return "bg-revenue-50 text-revenue-700";
  }
  return "bg-ink-100 text-ink-700";
}

/**
 * The "Test your AI" sandbox (Knowledge page). Lets the owner talk to their AI
 * exactly as a website customer would — same prompt, same model, same decision
 * logic — but as a pure dry run: nothing is saved, no lead or booking is
 * created, no alert fires. The thread lives only in client state and is passed
 * back to the server action each turn, so "Clear" genuinely erases it.
 * Visually a small-scale echo of WidgetChat: customer bubbles right in brand,
 * AI bubbles left on white.
 */
export function TestConsole() {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest turn in view as the thread grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    // Snapshot BEFORE appending: the action receives prior history + message.
    const history: ConversationTurn[] = messages.map(({ role, text: t }) => ({
      role,
      text: t,
    }));

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "customer", text }]);

    startTransition(async () => {
      const result = await askTestQuestion(history, text);
      if (!result.ok || !result.reply) {
        setError(result.error ?? "Something went wrong — try again.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.reply!, flags: result.flags },
      ]);
    });
  }

  return (
    <Card className="flex h-fit flex-col">
      <CardHeader>
        <div>
          <CardTitle>Test your AI</CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            Ask anything a customer might — nothing here is saved or sent.
          </p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="shrink-0 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            Clear
          </button>
        ) : null}
      </CardHeader>

      <CardBody className="flex flex-col gap-3">
        <div
          ref={scrollRef}
          className="max-h-96 min-h-48 space-y-3 overflow-y-auto rounded-lg bg-ink-50 p-3"
        >
          {messages.length === 0 && !pending ? (
            <p className="px-2 py-6 text-center text-sm text-muted">
              Try “Do you handle emergency calls on weekends?” or start a fake
              booking to see what your customers see.
            </p>
          ) : null}

          {messages.map((m, i) => (
            <div key={i}>
              <div
                className={
                  m.role === "customer" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm " +
                    (m.role === "customer"
                      ? "bg-brand-600 text-white"
                      : "border border-border bg-surface text-ink-800")
                  }
                >
                  {m.text}
                </div>
              </div>
              {m.flags && m.flags.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.flags.map((flag) => (
                    <span
                      key={flag}
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                        flagClasses(flag)
                      }
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {pending ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl border border-border bg-surface px-3 py-2.5">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl border border-copper-200 bg-copper-50 px-3 py-1.5 text-sm text-copper-700">
                {error}
              </div>
            </div>
          ) : null}
        </div>

        <form onSubmit={send} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask as if you were a customer…"
            aria-label="Test question"
            className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || pending}
            aria-label="Send test question"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {pending ? (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : (
              <SendIcon />
            )}
          </button>
        </form>
      </CardBody>
    </Card>
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

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12 20 4l-3.5 16-4.5-6-8-2Z" fill="currentColor" />
    </svg>
  );
}
