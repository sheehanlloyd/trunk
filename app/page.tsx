import Link from "next/link";

import { CountUp } from "@/components/marketing/CountUp";
import { DemoVideos } from "@/components/marketing/DemoVideos";
import { LiveDemo } from "@/components/marketing/LiveDemo";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * The public landing page. Marketing lives at `/`; the app lives behind
 * /dashboard (proxy-gated), so signed-out visitors land here and customers'
 * embedded widgets never touch this route. Static by design — no data
 * fetching, so it prerenders and stays fast.
 */

export const metadata = {
  title: "Trunk — AI receptionist for the trades",
};

/* --- tiny inline icons (stroke inherits currentColor) ---------------------- */
function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

const FEATURES = [
  {
    icon: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z",
    title: "Every call answered, 24/7",
    body: "A dedicated phone number that never rings out. After-hours, weekends, while you're elbow-deep in a condenser — Trunk picks up.",
  },
  {
    icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
    title: "Website chat that books jobs",
    body: "One script tag adds a chat widget that quotes your real services and price ranges — and walks customers into a booking.",
  },
  {
    icon: "M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z",
    title: "Emergencies escalate instantly",
    body: "Gas smell, burst pipe, no heat in January — Trunk follows your emergency playbook and texts you immediately, not tomorrow.",
  },
  {
    icon: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14ZM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
    title: "Review requests on tap",
    body: "Job done? One tap texts the customer your Google review link. Five stars compound faster than any ad budget.",
  },
  {
    icon: "M3 3v18h18M7 16l4-4 4 4 5-6",
    title: "Analytics that talk money",
    body: "Peak call hours, booking conversion, and the dollar value the AI captured this month — not vanity charts.",
  },
  {
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    title: "Bring the whole crew",
    body: "Invite your office manager or lead tech. Everyone sees bookings and conversations; you stay the owner.",
  },
  {
    icon: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z",
    title: "Teach it your business",
    body: "Spot a wrong answer? Correct it once and the AI uses your wording from the next conversation on.",
  },
  {
    icon: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
    title: "No lead left behind",
    body: "Caller hangs up mid-booking? Trunk saves what it got — name, number, problem — so you can call back and win the job.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "We read your website",
    body: "Point Trunk at your site. It learns your services, price ranges, hours, and service area in about a minute — you review and tweak before anything goes live.",
  },
  {
    n: "02",
    title: "You get a number and a widget",
    body: "A dedicated local phone number plus one script tag for your site. Forward your existing line after-hours or let Trunk take every call.",
  },
  {
    n: "03",
    title: "Jobs land in your pocket",
    body: "Every booking texts you instantly with the customer's name, number, and problem. Everything else waits politely in a daily digest.",
  },
] as const;

const FAQS = [
  {
    q: "Will callers know it's an AI?",
    a: "Trunk doesn't pretend to be human, and it doesn't need to. It answers instantly, knows your prices, and books the job — which beats voicemail every single time. Most callers just care that someone picked up.",
  },
  {
    q: "What happens to my existing phone number?",
    a: "Keep it. Most owners forward their published number to Trunk after a few rings, so a human can still grab the call first. Or hand out the Trunk number directly — your call.",
  },
  {
    q: "What if the AI doesn't know an answer?",
    a: "It says so honestly, takes the caller's details, and flags the conversation for you — it will never invent a price or promise a time you didn't approve. You can correct any answer from the dashboard and it sticks.",
  },
  {
    q: "How long does setup actually take?",
    a: "The scrape-and-review takes minutes. Most businesses are live — number, widget, and all — the same day they sign up.",
  },
] as const;

/** Small uppercase section label. Gray, never colored — the eyebrow's job is
 *  to orient, not to decorate. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-surface">
      {/* ------------------------------------------------- hero (warm black) */}
      <div className="bg-ink-900">
        <MarketingNav />

        <section className="mx-auto grid max-w-6xl items-center gap-16 px-6 pb-28 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-36 lg:pt-28">
          <div>
            <p className="rise-in mb-8 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
              For HVAC · Plumbing · Electrical
            </p>
            {/* The serif at weight 400 is the whole identity. Bolding it, or
                swapping in a grotesk, collapses this back into every other
                SaaS hero. */}
            <h1 className="rise-in font-editorial text-[44px] text-paper sm:text-6xl lg:text-[68px]">
              Your phones,
              <br />
              answered. Every time.
            </h1>
            <p className="rise-in mt-8 max-w-md text-[17px] leading-relaxed text-ink-300">
              Trunk is the AI receptionist that picks up your calls and website
              chats around the clock, books the job, and texts you the details —
              while you stay on the tools.
            </p>
            <div className="rise-in mt-10 flex flex-wrap items-center gap-3">
              <a
                href="#pricing"
                className="rounded-md bg-paper px-5 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
              >
                Get your number
              </a>
              <a
                href="#product"
                className="rounded-md border border-paper/40 px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:border-paper"
              >
                Watch it work
              </a>
            </div>
            <p className="rise-in mt-8 text-[13px] text-ink-500">
              Live the same day · No per-minute billing · Your data stays yours
            </p>
          </div>

          <LiveDemo />
        </section>
      </div>

      {/* ------------------------------------------- the missed-call math band */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <div className="grid gap-12 sm:grid-cols-3">
              {[
                {
                  value: <CountUp value={5} suffix=" calls" />,
                  caption:
                    "a typical shop misses in a week — after-hours, on the roof, on another line",
                  accent: false,
                },
                {
                  value: <CountUp value={350} prefix="$" />,
                  caption:
                    "the value of an average service job that just went to the next name on Google",
                  accent: false,
                },
                {
                  value: <CountUp value={1750} prefix="$" suffix="/wk" />,
                  caption:
                    "walking out the door — do that math against $199 a month",
                  accent: true,
                },
              ].map((stat, i) => (
                <div key={i}>
                  {/* Numbers in the serif: it makes a statistic read as a
                      pull-quote rather than a dashboard metric. */}
                  <p
                    className={
                      stat.accent
                        ? "font-editorial text-5xl text-revenue-700"
                        : "font-editorial text-5xl text-ink-900"
                    }
                  >
                    {stat.value}
                  </p>
                  <p className="mt-4 max-w-[26ch] text-[15px] leading-relaxed text-muted">
                    {stat.caption}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------ product demos */}
      <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-28">
        <Reveal className="mb-16 max-w-2xl">
          <Eyebrow>See it in action</Eyebrow>
          <h2 className="font-editorial text-[34px] text-ink-900 sm:text-[44px]">
            From “my AC died” to a booked job in under a minute
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-muted">
            Real recordings of Trunk doing the work — no mockups, no maybes.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <DemoVideos />
        </Reveal>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <section id="how" className="band scroll-mt-20 border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <Reveal className="mb-16 max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="font-editorial text-[34px] text-ink-900 sm:text-[44px]">
              Live before your next coffee break
            </h2>
          </Reveal>
          <div className="grid gap-12 md:grid-cols-3 md:gap-10">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 120}>
                <div>
                  <p className="font-editorial text-[28px] text-ink-300">{step.n}</p>
                  <h3 className="mt-4 text-[19px] font-medium tracking-tight text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-muted">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-28">
        <Reveal className="mb-16 max-w-2xl">
          <Eyebrow>Everything included</Eyebrow>
          <h2 className="font-editorial text-[34px] text-ink-900 sm:text-[44px]">
            A front office that fits in a script tag
          </h2>
        </Reveal>
        {/* No cards. Eight bordered boxes in a grid is the most template-
            looking layout in software marketing; type and space do it better. */}
        <div className="grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 90}>
              <div>
                <span className="text-ink-900">
                  <Icon path={f.icon} className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-4 text-[15px] font-medium tracking-tight text-ink-900">
                  {f.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ pricing */}
      <section id="pricing" className="scroll-mt-20 bg-ink-900">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <div className="grid items-start gap-16 lg:grid-cols-2">
            <Reveal>
              <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
                Pricing
              </p>
              <h2 className="font-editorial text-[34px] text-paper sm:text-[44px]">
                One plan. Everything on.
              </h2>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-300">
                No per-minute meters, no seat charges, no “premium” tier hiding
                the features you actually need. One booked job a month and Trunk
                has paid for itself.
              </p>
              <ul className="mt-10 space-y-4">
                {[
                  "Dedicated local phone number",
                  "Website chat widget, styled to match your brand",
                  "Instant SMS alerts for bookings and emergencies",
                  "Missed-lead recovery, analytics, and AI insights",
                  "Unlimited team members and knowledge corrections",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg
                      viewBox="0 0 16 16"
                      className="mt-1 h-3 w-3 shrink-0 text-revenue-500"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M13.7 4.3a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L7 9.6l5.3-5.3a1 1 0 0 1 1.4 0Z" />
                    </svg>
                    <span className="text-[15px] leading-relaxed text-ink-200">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <div className="border border-paper/15 p-8 sm:p-10">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
                  Trunk, all in
                </p>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="font-editorial text-[64px] leading-none text-paper">
                    $199
                  </span>
                  <span className="text-[15px] text-ink-400">/month</span>
                </p>
                <p className="mt-3 text-sm text-ink-400">
                  + $500 one-time setup — we do the setup <em>for</em> you
                </p>
                <div className="my-8 h-px bg-paper/15" />
                <p className="text-[15px] leading-relaxed text-ink-300">
                  Setup includes reading your website, tuning your services and
                  prices with you, provisioning your number, and installing the
                  widget. You go live the same day.
                </p>
                <a
                  href="mailto:hello@trunkhq.com?subject=Get%20me%20a%20number"
                  className="mt-8 block rounded-md bg-paper py-3 text-center text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
                >
                  Book a 15-minute setup call
                </a>
                <p className="mt-4 text-center text-xs text-ink-500">
                  Cancel anytime. Your data stays yours — always.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-28">
        <Reveal className="mb-12">
          <h2 className="font-editorial text-[34px] text-ink-900">Fair questions</h2>
        </Reveal>
        {/* Hairline-divided list rather than a stack of cards. */}
        <div className="border-t border-border">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.q} delay={i * 70}>
              <details className="group border-b border-border py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="text-ink-300 transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 max-w-2xl leading-relaxed text-muted">{faq.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- final CTA */}
      <section className="bg-ink-900">
        <div className="mx-auto max-w-4xl px-6 py-32 text-center">
          <Reveal>
            <h2 className="font-editorial text-[38px] text-paper sm:text-[54px]">
              The next call is coming.
              <br />
              Who’s picking up?
            </h2>
            <a
              href="mailto:hello@trunkhq.com?subject=Get%20me%20a%20number"
              className="mt-12 inline-block rounded-md bg-paper px-6 py-3 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
            >
              Get your number
            </a>
          </Reveal>
        </div>

        <footer className="border-t border-paper/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center rounded bg-paper text-[10px] font-semibold text-ink-900"
              >
                T
              </span>
              <span className="text-sm font-medium text-paper">Trunk</span>
              <span className="ml-2 text-xs text-ink-500">
                © {new Date().getFullYear()} · AI receptionist for the trades
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-ink-400">
              <a href="#features" className="transition-colors hover:text-paper">
                Features
              </a>
              <a href="#pricing" className="transition-colors hover:text-paper">
                Pricing
              </a>
              <Link href="/login" className="transition-colors hover:text-paper">
                Log in
              </Link>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
