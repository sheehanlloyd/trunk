import { WidgetChat } from "@/components/chat/WidgetChat";
import { isPaused } from "@/lib/billing/status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessStatus, WidgetConfig } from "@/lib/types/database";

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

interface WidgetBusiness {
  name: string;
  status: BusinessStatus;
  grace_period_ends_at: string | null;
  widget_config: WidgetConfig | null;
}

async function loadBusiness(businessId: string): Promise<WidgetBusiness | null> {
  if (!businessId) return null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("businesses")
      .select("name, status, grace_period_ends_at, widget_config")
      .eq("id", businessId)
      .maybeSingle<WidgetBusiness>();
    return data ?? null;
  } catch (err) {
    console.error("[widget/frame] failed to load business", err);
    return null;
  }
}

/**
 * Re-validates the stored widget_config at render time. saveWidgetConfig
 * already only writes clean values, but this frame is public and the column is
 * plain jsonb — a bad value must degrade to the stock widget, never reach an
 * inline style or the postMessage channel.
 */
function sanitizeWidgetConfig(raw: WidgetConfig | null): WidgetConfig {
  const config: WidgetConfig = {};
  if (!raw || typeof raw !== "object") return config;
  if (
    typeof raw.accent_color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(raw.accent_color)
  ) {
    config.accent_color = raw.accent_color;
  }
  if (typeof raw.greeting === "string" && raw.greeting.trim()) {
    config.greeting = raw.greeting.trim().slice(0, 200);
  }
  if (raw.position === "left" || raw.position === "right") {
    config.position = raw.position;
  }
  // Strict boolean — truthy strings from tampered jsonb must not enable it.
  if (raw.teaser === true) {
    config.teaser = true;
  }
  return config;
}

export default async function WidgetFramePage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const { businessId = "" } = await searchParams;
  const business = await loadBusiness(businessId.trim());

  // Make this route's document transparent so the host page shows through
  // around the bubble, scoped to this page only. `color-scheme: light` is
  // required alongside the transparent background: browsers paint a
  // transparent canvas using the visitor's OS light/dark preference, which
  // would otherwise render our fixed light theme unreadable (dark canvas
  // behind light text) for any visitor whose OS is set to dark mode.
  const transparentStyle =
    "html,body{background:transparent!important;margin:0;color-scheme:light}";

  if (!businessId.trim() || !business) {
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

  // Paused for billing (design §10): show a neutral, temporary message instead
  // of the chat. Nothing is deleted — the business simply isn't answering now.
  if (isPaused(business.status, business.grace_period_ends_at)) {
    return (
      <>
        <style>{transparentStyle}</style>
        <div className="flex h-dvh w-full items-end justify-end p-3">
          <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600 shadow">
            This chat is temporarily unavailable. Please check back soon.
          </div>
        </div>
      </>
    );
  }

  const config = sanitizeWidgetConfig(business.widget_config);

  return (
    <>
      <style>{transparentStyle}</style>
      <WidgetChat
        businessId={businessId.trim()}
        businessName={business.name}
        accentColor={config.accent_color}
        greeting={config.greeting}
        position={config.position}
        teaser={config.teaser}
      />
    </>
  );
}
