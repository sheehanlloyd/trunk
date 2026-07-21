"use client";

import { useActionState, useState, useTransition } from "react";

import {
  inviteStaff,
  removeStaff,
  type InviteResult,
} from "@/app/dashboard/actions";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Input";

/**
 * Client half of TeamCard: the invite form and the two-step remove button.
 * All authorization lives in the server actions — this is purely UI state.
 */

const INITIAL: InviteResult = { ok: false };

export function InviteStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaff, INITIAL);

  return (
    <form action={formAction} className="space-y-2">
      <label
        htmlFor="invite-email"
        className="block text-sm font-medium text-ink-900"
      >
        Invite a teammate
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          autoComplete="off"
          className="min-w-0 flex-1"
        />
        <Button type="submit" loading={pending} className="shrink-0">
          Invite
        </Button>
      </div>
      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state.ok && state.message ? (
        <p className="rounded-lg bg-revenue-50 p-3 text-sm text-revenue-700">
          {state.message}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Staff can see and manage everything except billing and team settings.
      </p>
    </form>
  );
}

export function RemoveMemberButton({
  memberId,
  email,
}: {
  memberId: string;
  email: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeStaff(memberId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't remove that teammate.");
        setConfirming(false);
      }
      // On success the action revalidates settings and the row disappears.
    });
  }

  if (!confirming) {
    return (
      <span className="flex items-center gap-2">
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Remove
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="hidden text-xs text-muted sm:inline">
        Remove {email}?
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={confirmRemove}
        disabled={pending}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Confirm"}
      </button>
    </span>
  );
}
