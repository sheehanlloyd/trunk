"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero's scripted product demo: a looping, self-typing conversation with
 * the receptionist, ending in a booked job and the owner's text alert. It's a
 * replica of the real widget (same shapes WidgetChat renders), scripted so the
 * landing page shows the product doing its job without an API call or a video
 * file. Under reduced motion the finished conversation renders immediately.
 */

type Step =
  | { kind: "customer" | "ai"; text: string }
  | { kind: "booked"; text: string }
  | { kind: "sms"; text: string };

const SCRIPT: Step[] = [
  { kind: "customer", text: "Our AC just died and it's 96° out. Can someone come today?" },
  {
    kind: "ai",
    text: "So sorry — that's miserable in this heat. We can absolutely get someone out. Can I grab your name and the best number to reach you?",
  },
  { kind: "customer", text: "Maria Torres, 512-555-0184. This afternoon if possible." },
  {
    kind: "ai",
    text: "Got it, Maria. I've got you down for an emergency AC repair this afternoon — a tech will call you within 15 minutes to confirm a time.",
  },
  { kind: "booked", text: "Booking captured — AC repair · this afternoon" },
  { kind: "sms", text: "New booking: Maria Torres, AC repair, TODAY. 512-555-0184" },
];

/** Timeline (ms): pause before each step's typing indicator, then the bubble. */
const TYPING_MS = 900;
const READ_MS = 1400;
const LOOP_PAUSE_MS = 4200;

export function LiveDemo() {
  // `visible` = number of script steps currently shown; `typing` = indicator on.
  const [visible, setVisible] = useState(0);
  const [typing, setTyping] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setVisible(SCRIPT.length);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(setTimeout(resolve, ms));
      });

    (async () => {
      // Loop the conversation forever; each pass resets after a hold.
      while (!cancelled) {
        setVisible(0);
        await wait(600);
        for (let i = 0; i < SCRIPT.length && !cancelled; i++) {
          const step = SCRIPT[i];
          if (step.kind === "ai") {
            setTyping(true);
            await wait(TYPING_MS);
            setTyping(false);
          }
          setVisible(i + 1);
          await wait(step.kind === "customer" ? READ_MS : READ_MS + 300);
        }
        await wait(LOOP_PAUSE_MS);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const steps = SCRIPT.slice(0, visible);

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* Floating proof chips behind/around the widget card. */}
      <div className="float-slow absolute -left-6 -top-8 hidden rounded-md border border-paper/15 px-3 py-2 backdrop-blur-sm sm:block">
        <p className="text-xs font-medium text-ink-300">
          2:14 AM — call answered
        </p>
      </div>
      <div className="float-slower absolute -bottom-12 -right-6 z-10 hidden rounded-md border border-paper/15 bg-ink-900 px-3 py-2 sm:block">
        <p className="text-xs font-medium text-revenue-500">
          $480 job captured while you were on a roof
        </p>
      </div>

      {/* Widget replica */}
      <div className="overflow-hidden rounded-lg bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-[13px] font-medium text-paper">
            C
          </span>
          <div>
            <p className="text-sm font-medium text-ink-900">Cool Breeze HVAC</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-revenue-500" />
              Answering 24/7
            </p>
          </div>
        </div>

        {/* Fixed height sized to the fully-played script: the panel must not
            grow as messages arrive, or the whole hero reflows mid-loop. */}
        <div className="flex h-[392px] flex-col justify-end gap-2.5 overflow-hidden bg-ink-50 p-4">
          {steps.map((step, i) => {
            if (step.kind === "booked") {
              return (
                <div
                  key={i}
                  className="msg-in mt-1 flex items-center gap-2 self-center rounded border border-revenue-100 bg-revenue-50 px-2.5 py-1"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-revenue-600" fill="currentColor" aria-hidden>
                    <path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0Zm3.7 6.2-4.2 4.3a.75.75 0 0 1-1.1 0L4.3 8.4a.75.75 0 0 1 1.06-1.06l1.6 1.55 3.68-3.75A.75.75 0 1 1 11.7 6.2Z" />
                  </svg>
                  <p className="text-[11.5px] font-medium text-revenue-700">{step.text}</p>
                </div>
              );
            }
            if (step.kind === "sms") {
              return (
                <div
                  key={i}
                  className="msg-in mt-1 self-stretch rounded-md border border-border bg-surface p-3"
                >
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                      <path d="M2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-3.4 2.8A.6.6 0 0 1 4.6 14v-2H4a2 2 0 0 1-2-2V3Z" />
                    </svg>
                    Text to owner
                  </p>
                  <p className="text-xs text-ink-900">{step.text}</p>
                </div>
              );
            }
            const isAi = step.kind === "ai";
            return (
              <div
                key={i}
                className={
                  isAi
                    ? "msg-in max-w-[85%] self-start rounded-lg rounded-bl-sm border border-border bg-surface px-3.5 py-2.5"
                    : "msg-in max-w-[85%] self-end rounded-lg rounded-br-sm bg-ink-900 px-3.5 py-2.5"
                }
              >
                <p className={isAi ? "text-[13px] leading-snug text-ink-900" : "text-[13px] leading-snug text-paper"}>
                  {step.text}
                </p>
              </div>
            );
          })}

          {typing && (
            <div className="msg-in flex gap-1 self-start rounded-lg rounded-bl-sm border border-border bg-surface px-4 py-3">
              <span className="type-dot h-1.5 w-1.5 rounded-full bg-ink-400" />
              <span className="type-dot h-1.5 w-1.5 rounded-full bg-ink-400" style={{ animationDelay: "150ms" }} />
              <span className="type-dot h-1.5 w-1.5 rounded-full bg-ink-400" style={{ animationDelay: "300ms" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
