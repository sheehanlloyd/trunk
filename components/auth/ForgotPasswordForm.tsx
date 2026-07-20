"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Field, Input } from "@/components/shared/Input";
import { createClient } from "@/lib/supabase/client";

/**
 * Requests a password-reset email. Always shows the same success state
 * regardless of whether the email has an account (no user enumeration).
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    // Result intentionally ignored: revealing failures would leak which
    // emails have accounts.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-ink-900">
          Check your email
        </h1>
        <p className="mt-1 text-sm text-muted">
          If that email has an account, a reset link is on the way.
        </p>
        <p className="mt-4 text-center text-sm text-muted">
          <Link
            href="/login"
            className="font-medium text-brand-700 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold text-ink-900">
        Reset your password
      </h1>
      <p className="mt-1 text-sm text-muted">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Field label="Email">
          <Input
            type="email"
            required
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Button type="submit" fullWidth loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-brand-700 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
