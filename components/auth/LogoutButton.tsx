"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      fullWidth
      loading={loading}
      onClick={handleLogout}
      className={className}
    >
      Sign out
    </Button>
  );
}
