"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { createClient } from "@/lib/supabase/client";

/**
 * Invite-only account setup. The email must already exist as an invited
 * business_users row (auth_user_id = null); a DB trigger links the new auth
 * user to that membership on insert. Emails with no invite still create an
 * auth user but land on the "no business associated" dashboard state.
 */
export function AcceptInviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If email confirmation is required, there's no session yet.
    if (!data.session) {
      setNotice(
        "Check your email to confirm your account, then sign in.",
      );
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold text-slate-900">
        Set up your account
      </h1>
      <p className="mt-1 text-sm text-muted">
        Use the email address your invite was sent to.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Create password
          </span>
          <input
            type="password"
            required
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {notice}
          </p>
        ) : null}

        <Button type="submit" fullWidth loading={loading}>
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
