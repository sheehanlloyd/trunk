import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign in — AI Receptionist" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = redirect?.startsWith("/") ? redirect : "/dashboard";
  return <LoginForm redirectTo={redirectTo} />;
}
