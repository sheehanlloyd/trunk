"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Field, Input } from "@/components/shared/Input";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "invalid" | "done";

/** How long to wait for the recovery link's session exchange before declaring
 *  the link invalid. The exchange normally settles well within this window. */
const SESSION_WAIT_MS = 3000;

/**
 * Sets a new password after a Supabase recovery link. The link signs the user
 * in (the session arrives via the URL and is exchanged by the browser client),
 * so we wait briefly for a session before showing the form; without one the
 * link is invalid or expired.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // A session can arrive at any point while the URL tokens are exchanged, so
    // listen for auth changes rather than checking once.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        setStatus((s) => (s === "checking" ? "ready" : s));
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        setStatus((s) => (s === "checking" ? "ready" : s));
      }
    });

    const timer = setTimeout(() => {
      if (active) setStatus((s) => (s === "checking" ? "invalid" : s));
    }, SESSION_WAIT_MS);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setStatus("done");
  }

  if (status === "checking") {
    return (
      <Card className="p-6">
        <p className="text-center text-sm text-muted">Checking your link…</p>
      </Card>
    );
  }

  if (status === "invalid") {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-ink-900">
          Link expired
        </h1>
        <p className="mt-1 text-sm text-muted">
          This reset link is invalid or expired.
        </p>
        <p className="mt-4 text-center text-sm text-muted">
          <Link
            href="/forgot-password"
            className="font-medium text-brand-700 hover:underline"
          >
            Request a new reset link
          </Link>
        </p>
      </Card>
    );
  }

  if (status === "done") {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-ink-900">
          Password updated
        </h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;re signed in with your new password.
        </p>
        <Button
          type="button"
          fullWidth
          className="mt-5"
          onClick={() => {
            router.replace("/dashboard");
            router.refresh();
          }}
        >
          Go to dashboard
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold text-ink-900">
        Choose a new password
      </h1>
      <p className="mt-1 text-sm text-muted">
        Enter a new password for your account.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Field label="New password" hint="At least 8 characters.">
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            required
            minLength={8}
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <Button type="submit" fullWidth loading={loading}>
          Update password
        </Button>
      </form>
    </Card>
  );
}
