import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-display text-base font-bold text-white"
            >
              T
            </span>
            <p className="font-display text-xl font-bold text-brand-700">Trunk</p>
          </div>
          <p className="mt-1 text-sm text-muted">
            The AI receptionist for HVAC, plumbing &amp; electrical pros
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
