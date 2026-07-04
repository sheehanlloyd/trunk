import type { Metadata } from "next";

import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm";

export const metadata: Metadata = {
  title: "Set up your account — AI Receptionist",
};

export default function AcceptInvitePage() {
  return <AcceptInviteForm />;
}
