"use client";

import { useActionState, useState } from "react";

import { saveWidgetConfig, type ActionResult } from "@/app/dashboard/actions";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";
import type { WidgetConfig } from "@/lib/types/database";

const INITIAL: ActionResult = { ok: false };

/** Stock accent — brand-600 petrol, exactly what the widget ships with. */
const DEFAULT_ACCENT = "#0e4c5e";

const SWATCHES: { name: string; hex: string }[] = [
  { name: "Petrol", hex: "#0e4c5e" },
  { name: "Emerald", hex: "#0a7a57" },
  { name: "Copper", hex: "#b5713f" },
  { name: "Slate", hex: "#334155" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Red", hex: "#b91c1c" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const GREETING_MAX = 200;

/**
 * Widget customization studio (v2). Owners tune the accent color, greeting,
 * and screen position of their embeddable chat widget and see the result
 * immediately in a mock browser window — both the collapsed bubble and the
 * open panel — before saving. Persists via `saveWidgetConfig`, which validates
 * server-side; the public widget frame reads the saved config.
 */
export function WidgetStudio({
  businessName,
  config,
}: {
  businessName: string;
  config: WidgetConfig;
}) {
  const [state, formAction, pending] = useActionState(saveWidgetConfig, INITIAL);

  const [accent, setAccent] = useState(config.accent_color ?? "");
  const [greeting, setGreeting] = useState(config.greeting ?? "");
  const [position, setPosition] = useState<"right" | "left">(
    config.position ?? "right",
  );
  const [teaserOn, setTeaserOn] = useState(config.teaser ?? false);

  const accentInvalid = accent.trim() !== "" && !HEX_RE.test(accent.trim());
  const previewAccent = HEX_RE.test(accent.trim())
    ? accent.trim()
    : DEFAULT_ACCENT;
  const defaultGreeting = `Hi! Thanks for reaching out to ${businessName}. How can I help you today?`;
  const previewGreeting = greeting.trim() || defaultGreeting;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget studio</CardTitle>
        <span className="rounded-full bg-revenue-50 px-2.5 py-0.5 text-xs font-medium text-revenue-700">
          Live preview
        </span>
      </CardHeader>
      <CardBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* --- Controls ----------------------------------------------------- */}
          <form action={formAction} className="space-y-5">
            <input type="hidden" name="position" value={position} />
            <input type="hidden" name="teaser" value={teaserOn ? "true" : ""} />

            <div>
              <span className="mb-1 block text-sm font-medium text-ink-900">
                Accent color
              </span>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => {
                  const selected =
                    accent.trim().toLowerCase() === s.hex ||
                    (accent.trim() === "" && s.hex === DEFAULT_ACCENT);
                  return (
                    <button
                      key={s.hex}
                      type="button"
                      title={s.name}
                      aria-label={`Use ${s.name}`}
                      aria-pressed={selected}
                      onClick={() => setAccent(s.hex)}
                      className={
                        "h-8 w-8 rounded-full border border-black/10 transition " +
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 " +
                        (selected
                          ? "ring-2 ring-brand-500 ring-offset-2"
                          : "hover:scale-110")
                      }
                      style={{ backgroundColor: s.hex }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-8 w-8 shrink-0 rounded-lg border border-border"
                  style={{ backgroundColor: previewAccent }}
                />
                <input
                  name="accent_color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  placeholder={DEFAULT_ACCENT}
                  maxLength={7}
                  spellCheck={false}
                  aria-label="Accent color hex value"
                  aria-invalid={accentInvalid}
                  className="w-32 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <span
                className={
                  "mt-1 block text-xs " +
                  (accentInvalid ? "text-red-600" : "text-muted")
                }
              >
                {accentInvalid
                  ? "Use a 6-digit hex value like #0e4c5e."
                  : "Pick a preset or paste any hex color. Leave blank for the stock look."}
              </span>
            </div>

            <div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-900">
                  Greeting
                </span>
                <textarea
                  name="greeting"
                  value={greeting}
                  onChange={(e) =>
                    setGreeting(e.target.value.slice(0, GREETING_MAX))
                  }
                  rows={3}
                  maxLength={GREETING_MAX}
                  placeholder={defaultGreeting}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <span className="mt-1 flex justify-between text-xs text-muted">
                <span>The first message customers see when the chat opens.</span>
                <span className="tabular-nums">
                  {greeting.length}/{GREETING_MAX}
                </span>
              </span>
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-ink-900">
                Position
              </span>
              <div
                role="group"
                aria-label="Widget position"
                className="inline-flex rounded-lg border border-border bg-ink-50 p-0.5"
              >
                {(["left", "right"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={position === p}
                    onClick={() => setPosition(p)}
                    className={
                      "rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
                      (position === p
                        ? "bg-surface text-brand-800 shadow-card"
                        : "text-muted hover:text-ink-900")
                    }
                  >
                    {p === "left" ? "Bottom left" : "Bottom right"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="block text-sm font-medium text-ink-900">
                  Greeting teaser
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  After ~5 seconds, preview your greeting next to the bubble to
                  invite visitors in.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={teaserOn}
                aria-label="Greeting teaser"
                onClick={() => setTeaserOn((v) => !v)}
                className={
                  "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 " +
                  (teaserOn
                    ? "border-brand-600 bg-brand-600"
                    : "border-border bg-ink-100")
                }
              >
                <span
                  aria-hidden
                  className={
                    "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-card transition-[left] " +
                    (teaserOn ? "left-[22px]" : "left-0.5")
                  }
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <div className="text-sm">
                {state.error ? (
                  <span className="text-red-600">{state.error}</span>
                ) : null}
                {state.ok ? (
                  <span className="font-medium text-accent-700">
                    Saved — live on your site now.
                  </span>
                ) : null}
              </div>
              <Button type="submit" loading={pending}>
                Save widget
              </Button>
            </div>
          </form>

          {/* --- Live preview ------------------------------------------------- */}
          <div className="space-y-4">
            <BrowserMock label="Open" tall position={position}>
              <WidgetPanelPreview
                accent={previewAccent}
                greeting={previewGreeting}
                businessName={businessName}
              />
            </BrowserMock>
            <BrowserMock label="Collapsed" position={position}>
              <div
                className={
                  "flex flex-col gap-1.5 " +
                  (position === "left" ? "items-start" : "items-end")
                }
              >
                {teaserOn ? (
                  <div className="relative max-w-40 rounded-lg border border-border bg-white px-2.5 py-1.5 shadow-raised">
                    <p className="line-clamp-2 text-[10px] leading-snug text-ink-800">
                      {previewGreeting}
                    </p>
                    <span
                      aria-hidden
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-white text-ink-500"
                    >
                      <TinyCloseIcon />
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg"
                  style={{ backgroundColor: previewAccent }}
                >
                  <MiniChatIcon />
                </button>
              </div>
            </BrowserMock>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * A fake browser window: chrome bar with traffic lights + address pill, a
 * skeleton "page", and the previewed widget floated in the chosen corner.
 */
function BrowserMock({
  label,
  tall = false,
  position,
  children,
}: {
  label: string;
  tall?: boolean;
  position: "right" | "left";
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
      {/* Chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-ink-50 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
        </span>
        <span className="mx-auto flex min-w-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11px] text-muted">
          <LockIcon />
          yourbusiness.com
        </span>
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-600">
          {label}
        </span>
      </div>
      {/* Page + widget */}
      <div
        className={
          "relative bg-ink-50 " + (tall ? "h-80" : "h-32")
        }
      >
        {/* Skeleton page content */}
        <div className="space-y-2.5 p-4" aria-hidden>
          <div className="h-3 w-2/5 rounded bg-ink-100" />
          <div className="h-2 w-4/5 rounded bg-ink-100/70" />
          <div className="h-2 w-3/5 rounded bg-ink-100/70" />
          {tall ? (
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="h-14 rounded-lg bg-ink-100/60" />
              <div className="h-14 rounded-lg bg-ink-100/60" />
              <div className="h-14 rounded-lg bg-ink-100/60" />
            </div>
          ) : null}
        </div>
        <div
          className={
            "absolute bottom-3 " + (position === "left" ? "left-3" : "right-3")
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Non-functional, scaled-down replica of the open chat panel. */
function WidgetPanelPreview({
  accent,
  greeting,
  businessName,
}: {
  accent: string;
  greeting: string;
  businessName: string;
}) {
  return (
    <div className="flex w-60 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 text-white"
        style={{ backgroundColor: accent }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {businessName.trim().charAt(0) || "A"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{businessName}</p>
            <p className="flex items-center gap-1 text-[10px] text-white/80">
              <span
                aria-hidden
                className="inline-block h-1 w-1 rounded-full bg-revenue-200"
              />
              We typically reply in a moment
            </p>
          </div>
        </div>
        <span aria-hidden className="p-1 text-white/90">
          <MiniCloseIcon />
        </span>
      </div>
      {/* Greeting bubble */}
      <div className="bg-[var(--color-background)] px-3 py-3">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs leading-relaxed text-ink-800">
          {greeting}
        </div>
      </div>
      {/* Composer */}
      <div className="flex items-center gap-1.5 border-t border-border bg-surface px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate rounded-full border border-border bg-white px-3 py-1.5 text-xs text-ink-300">
          Type your message…
        </span>
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: accent }}
        >
          <MiniSendIcon />
        </span>
      </div>
    </div>
  );
}

function MiniChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c5 0 9 3.4 9 7.5S17 18 12 18c-1 0-2-.1-2.9-.4L4 19l1.2-3.3C3.8 14.4 3 12.6 3 10.5 3 6.4 7 3 12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MiniCloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TinyCloseIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MiniSendIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12 20 4l-3.5 16-4.5-6-8-2Z" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}
