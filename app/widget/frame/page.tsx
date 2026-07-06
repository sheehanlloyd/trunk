import { WidgetChat } from "@/components/chat/WidgetChat";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The chat widget's iframe document. `public/widget.js` embeds this route on a
 * third-party site as `/widget/frame?businessId=…`. It's served from our origin,
 * so the chat UI and its /api/chat calls are same-origin while the iframe keeps
 * the whole thing isolated from the host page's styles.
 *
 * The background is transparent so only the floating bubble shows when collapsed.
 */

export const runtime = "nodejs";
// Always render per-request: the businessId comes from the query string.
export const dynamic = "force-dynamic";

async function loadBusinessName(businessId: string): Promise<string | null> {
  if (!businessId) return null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("businesses")
      .select("name")
      .eq("id", businessId)
      .maybeSingle<{ name: string }>();
    return data?.name ?? null;
  } catch (err) {
    console.error("[widget/frame] failed to load business", err);
    return null;
  }
}

export default async function WidgetFramePage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const { businessId = "" } = await searchParams;
  const name = await loadBusinessName(businessId.trim());

  // Make this route's document transparent so the host page shows through
  // around the bubble, scoped to this page only. `color-scheme: light` is
  // required alongside the transparent background: browsers paint a
  // transparent canvas using the visitor's OS light/dark preference, which
  // would otherwise render our fixed light theme unreadable (dark canvas
  // behind light text) for any visitor whose OS is set to dark mode.
  const transparentStyle =
    "html,body{background:transparent!important;margin:0;color-scheme:light}";

  if (!businessId.trim() || !name) {
    return (
      <>
        <style>{transparentStyle}</style>
        <div className="flex h-dvh w-full items-end justify-end p-3">
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
            Chat unavailable — unknown business.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{transparentStyle}</style>
      <WidgetChat businessId={businessId.trim()} businessName={name} />
    </>
  );
}
