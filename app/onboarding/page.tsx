import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOperator } from "@/lib/auth/operator";

import { OnboardingClient } from "./OnboardingClient";

export const metadata: Metadata = {
  title: "Onboard a business — AI Receptionist",
};

/**
 * Operator-only onboarding tool. The proxy guarantees an authenticated session;
 * here we additionally enforce the operator allowlist. Non-operators are sent to
 * the dashboard rather than shown the tool.
 */
export default async function OnboardingPage() {
  const operator = await getOperator();
  if (!operator) redirect("/dashboard");

  return (
    <main className="min-h-dvh bg-[--color-background]">
      <OnboardingClient operatorEmail={operator.email} />
    </main>
  );
}
