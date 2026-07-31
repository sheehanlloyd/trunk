/**
 * "See it in action" — real screen recordings of the product, captured from
 * the running app (files in /public/demo). Each clip sits in a faux browser
 * chrome so it reads as product, not stock footage. Videos are muted,
 * autoplaying loops (the accepted pattern for product demos — no audio, no
 * controls to fiddle with); an .mp4/.webm renders via <video>, a .gif via
 * <img>, so the capture pipeline can produce either.
 */

interface DemoClip {
  src: string;
  title: string;
  caption: string;
  /** Shown in the faux address bar — the widget clip is a customer's site. */
  url: string;
}

const CLIPS: DemoClip[] = [
  {
    src: "/demo/widget.mp4",
    title: "A customer books through your website",
    caption:
      "The widget answers questions with your real services and prices, then captures the booking — name, number, job, time.",
    url: "coolbreezehvac.com",
  },
  {
    src: "/demo/dashboard.mp4",
    title: "You see every conversation and dollar",
    caption:
      "Bookings, transcripts, missed-call leads, and the revenue the AI captured — all in one dashboard built for a phone in a truck.",
    url: "app.trunkhq.com",
  },
];

function ClipMedia({ clip }: { clip: DemoClip }) {
  // Both clips sit in a fixed 16:10 window so the two columns line up no
  // matter what each recording's native aspect ratio is. object-top keeps the
  // meaningful part of a taller capture in frame.
  const media = "absolute inset-0 h-full w-full object-cover object-top";
  return (
    <div className="relative aspect-[16/10] bg-ink-50">
      {clip.src.endsWith(".gif") ? (
        // eslint-disable-next-line @next/next/no-img-element -- animated capture; next/image would freeze it
        <img src={clip.src} alt={clip.title} className={media} />
      ) : (
        <video
          src={clip.src}
          autoPlay
          loop
          muted
          playsInline
          aria-label={clip.title}
          className={media}
        />
      )}
    </div>
  );
}

export function DemoVideos() {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
      {CLIPS.map((clip) => (
        <figure key={clip.src}>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {/* Faux browser chrome */}
            <div className="flex items-center gap-1.5 border-b border-border bg-ink-50 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
              <span className="ml-3 hidden flex-1 rounded bg-surface px-3 py-1 text-xs text-ink-400 sm:block">
                {clip.url}
              </span>
            </div>
            <ClipMedia clip={clip} />
          </div>
          <figcaption className="mt-5 px-1">
            <p className="text-[16px] font-medium tracking-tight text-ink-900">
              {clip.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{clip.caption}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
