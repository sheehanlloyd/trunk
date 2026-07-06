import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xl font-bold text-brand-700">AI Receptionist</p>
          <p className="mt-1 text-sm text-muted">
            Dashboard for HVAC, plumbing &amp; electrical pros
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
