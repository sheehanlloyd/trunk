import { cn } from "@/lib/utils";

/**
 * Shared form primitives. Before these existed, every form (LoginForm,
 * SettingsForm, CorrectionForm, OnboardingClient, …) hand-rolled the same
 * input styling; new v2 forms should compose these instead so a styling
 * change lands everywhere at once. Server-renderable — no client hooks.
 */

const baseInputClass =
  "w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink-900 " +
  "transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-400 hover:border-border-strong " +
  "focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseInputClass, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseInputClass, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseInputClass, className)} {...props}>
      {children}
    </select>
  );
}

/** Label + control + optional hint, matching the existing form layout. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
