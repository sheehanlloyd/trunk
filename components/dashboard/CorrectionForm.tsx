"use client";

import { useActionState } from "react";

import { submitCorrection, type ActionResult } from "@/app/dashboard/actions";
import { Button } from "@/components/shared/Button";

const INITIAL: ActionResult = { ok: false };

interface CorrectionFormProps {
  /** The AI answer being corrected, prefilled and shown read-only. Omit for a
   *  general correction not tied to a specific transcript line. */
  originalContent?: string;
  /** Called after a successful save (e.g. to collapse an inline editor). */
  onSaved?: () => void;
  submitLabel?: string;
}

/**
 * The write half of the AI feedback loop (design §12). Submitting inserts a
 * knowledge_correction; because every future conversation turn re-reads these,
 * the fix is live on the next customer message — which is why the success copy
 * promises exactly that.
 */
export function CorrectionForm({
  originalContent,
  onSaved,
  submitLabel = "Save correction",
}: CorrectionFormProps) {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await submitCorrection(prev, formData);
      if (result.ok) onSaved?.();
      return result;
    },
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-3">
      {originalContent !== undefined ? (
        <>
          <input type="hidden" name="original_content" value={originalContent} />
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              What the AI said
            </span>
            {originalContent}
          </div>
        </>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-900">
            What did the AI get wrong? <span className="text-muted">(optional)</span>
          </span>
          <textarea
            name="original_content"
            rows={2}
            placeholder="e.g. It quoted $50 for a drain cleaning"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-900">
          What should it say instead?
        </span>
        <textarea
          name="corrected_content"
          rows={3}
          required
          placeholder="e.g. Drain cleaning starts at $150. Never quote below that."
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900"
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="text-sm font-medium text-accent-700">
          Saved. Your AI will use this from the next conversation on.
        </p>
      ) : null}

      <Button type="submit" loading={pending} fullWidth>
        {submitLabel}
      </Button>
    </form>
  );
}
