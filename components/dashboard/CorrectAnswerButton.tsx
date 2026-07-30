"use client";

import { useState } from "react";

import { Button } from "@/components/shared/Button";

import { CorrectionForm } from "./CorrectionForm";

/**
 * The one-tap entry point from a transcript (design §5): reveals an inline
 * correction editor prefilled with the AI answer being corrected. Collapses
 * itself once the correction is saved.
 */
export function CorrectAnswerButton({ answer }: { answer: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="mt-2 text-sm font-medium text-accent-700">
        ✓ Correction saved — your AI is updated.
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => setOpen(true)}
      >
        Correct this answer
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-white p-3">
      <CorrectionForm
        originalContent={answer}
        submitLabel="Save correction"
        onSaved={() => setDone(true)}
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-xs font-medium text-muted hover:text-ink-700"
      >
        Cancel
      </button>
    </div>
  );
}
