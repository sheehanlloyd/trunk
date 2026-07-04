import { redirect } from "next/navigation";

export default function RootPage() {
  // Middleware gates /dashboard: signed-out users are bounced to /login.
  redirect("/dashboard");
}
