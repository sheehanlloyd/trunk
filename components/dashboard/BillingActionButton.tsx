"use client";

import { useState } from "react";

import { Button } from "@/components/shared/Button";

/**
 * Kicks off a Stripe redirect. POSTs to a billing endpoint that returns a hosted
 * Stripe URL ({ url }), then sends the browser there. Used for both "Start
 * subscription" (/api/stripe/checkout) and "Manage billing" (/api/stripe/portal).
 */
export function BillingActionButton({
  endpoint,
  label,
  variant = "primary",
}: {
  endpoint: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <Button onClick={go} loading={loading} variant={variant}>
        {label}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
