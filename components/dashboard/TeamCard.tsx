import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";
import {
  InviteStaffForm,
  RemoveMemberButton,
} from "@/components/dashboard/TeamCardClient";
import { formatDate } from "@/lib/dashboard/format";
import { createClient } from "@/lib/supabase/server";
import type { BusinessUser, UserRole } from "@/lib/types/database";

/**
 * Team management (v2): lists everyone with access to this business and, for
 * the owner, exposes invite/remove. Reads run as the signed-in user under RLS
 * (business_users_select allows seeing memberships within your own business);
 * the writes live in owner-checked server actions. Server component — the
 * interactive bits (invite form, two-step remove) come from TeamCardClient.
 */
export async function TeamCard({
  businessId,
  viewerRole,
}: {
  businessId: string;
  viewerRole: UserRole;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_users")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  const members = (data ?? []) as BusinessUser[];
  const isOwner = viewerRole === "owner";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <span className="text-xs text-muted">
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">
                    {m.email}
                  </span>
                  <RoleBadge role={m.role} />
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {m.auth_user_id === null ? (
                    <span className="text-copper-700">
                      Invited — hasn&apos;t signed in yet
                    </span>
                  ) : (
                    <>Joined {formatDate(m.created_at)}</>
                  )}
                </p>
              </div>
              {isOwner && m.role !== "owner" ? (
                <RemoveMemberButton memberId={m.id} email={m.email} />
              ) : null}
            </li>
          ))}
        </ul>

        {isOwner ? (
          <div className="border-t border-border pt-4">
            <InviteStaffForm />
          </div>
        ) : (
          <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
            Only the owner can invite or remove teammates.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return role === "owner" ? (
    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
      Owner
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
      Staff
    </span>
  );
}
