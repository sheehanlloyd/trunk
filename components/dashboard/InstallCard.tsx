"use client";

import { useState } from "react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";

interface InstallCardProps {
  embedCode: string;
  /** The AI's assigned phone number (E.164), or null until provisioned. */
  phoneNumber: string | null;
}

/**
 * Surfaces the two things a new owner needs to actually go live — their embed
 * snippet and their AI's phone number — permanently in the dashboard. These were
 * previously shown only to the operator at onboarding and never again, so an
 * owner who lost the welcome email had no way to recover them.
 */
export function InstallCard({ embedCode, phoneNumber }: InstallCardProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (rare) — the code is visible to select manually.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install your receptionist</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink-900">
              Website chat widget
            </span>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {copied ? "Copied ✓" : "Copy code"}
            </button>
          </div>
          <p className="mb-2 text-xs text-muted">
            Paste this into your website, just before the closing{" "}
            <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11px] text-brand-700">
              &lt;/body&gt;
            </code>{" "}
            tag. That&apos;s it — the chat bubble appears for your visitors.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-ink-900 p-3 font-mono text-xs leading-relaxed text-ink-100">
            <code>{embedCode}</code>
          </pre>
        </div>

        <div className="border-t border-border pt-4">
          <span className="text-sm font-medium text-ink-900">
            Your AI&apos;s phone number
          </span>
          {phoneNumber ? (
            <div className="mt-1 flex items-center gap-3">
              <a
                href={`tel:${phoneNumber}`}
                className="font-display text-xl font-semibold text-brand-800 hover:underline"
              >
                {phoneNumber}
              </a>
              <span className="rounded-full bg-revenue-50 px-2.5 py-0.5 text-xs font-medium text-revenue-700">
                Live
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Pending — assigned when you go live. We&apos;ll email you the moment
              it&apos;s ready.
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            Forward your existing line here after a few rings, or hand this number
            out directly — either way your AI answers.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
