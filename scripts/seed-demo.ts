/**
 * Fills the Cool Breeze HVAC demo tenant with a month of realistic activity so
 * the dashboard, analytics, and leads pages look like a business that's been
 * live for a while — used for local demos, screenshots, and the landing-page
 * recordings. Deterministic (seeded PRNG), so re-running produces the same
 * shape of data.
 *
 * DESTRUCTIVE for the demo tenant only: wipes and re-creates Cool Breeze's
 * conversations/bookings/leads/notifications. Refuses to run against anything
 * but a local Supabase.
 *
 * Usage:
 *   npx supabase start
 *   npx tsx scripts/seed-demo.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    /* rely on ambient env */
  }
}
loadEnvLocal();

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111"; // Cool Breeze HVAC

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Refusing to seed demo data into a non-local Supabase.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// --- deterministic PRNG (mulberry32) ----------------------------------------
let seed = 0xc001b12e;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function chance(p: number): boolean {
  return rand() < p;
}

// --- fake-but-plausible people ----------------------------------------------
const FIRST = ["Maria", "James", "Dana", "Luis", "Priya", "Tom", "Angela", "Derek", "Sofia", "Hank", "Nicole", "Ray", "Beth", "Omar", "Kelly", "Victor"];
const LAST = ["Torres", "Whitfield", "Nguyen", "Ramos", "Patel", "Becker", "Osei", "Kowalski", "Lane", "Marsh", "Duffy", "Silva", "Grant", "Ellis"];
const STREETS = ["Maple Ave", "Cedar Ln", "Oakmont Dr", "Barton St", "Hillcrest Rd", "Juniper Ct"];

function person() {
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const phone = `512-555-0${String(100 + Math.floor(rand() * 899))}`;
  return { name, phone };
}

// --- conversation templates ---------------------------------------------------
type Outcome = "booked" | "no_action" | "unclear" | "emergency_escalated" | "voicemail_left";

const SERVICES = [
  { s: "AC repair", problem: "AC is blowing warm air" },
  { s: "AC repair", problem: "AC won't turn on at all" },
  { s: "Furnace repair", problem: "furnace is making a banging noise" },
  { s: "Duct cleaning", problem: "vents smell musty" },
  { s: "AC tune-up", problem: "just want a seasonal check before summer" },
  { s: "Thermostat install", problem: "new smart thermostat needs wiring" },
  { s: "Heat pump service", problem: "heat pump keeps short-cycling" },
] as const;

const TIMES = ["tomorrow morning", "this afternoon", "Friday after 2pm", "any weekday morning", "Saturday if possible", "as soon as you can"];

function bookedTranscript(name: string, phone: string, service: string, problem: string, time: string) {
  return [
    { role: "customer", text: `Hi, our ${problem}. Can you help?` },
    { role: "assistant", text: `Sorry to hear that — we can definitely help with that. Can I get your name and the best number to reach you?` },
    { role: "customer", text: `${name}, ${phone}. ${time} would be ideal.` },
    { role: "assistant", text: `Perfect, ${name.split(" ")[0]}. I've got you down for ${service.toLowerCase()} — ${time}. A tech will call to confirm the exact window. Anything else I should note?` },
    { role: "customer", text: "No that's it, thanks!" },
    { role: "assistant", text: "You're all set. Talk soon!" },
  ];
}

function noActionTranscript(problem: string) {
  return [
    { role: "customer", text: `How much do you charge for ${problem.includes("check") ? "a tune-up" : "a service call"}?` },
    { role: "assistant", text: "A standard service call is typically $89–$129 depending on the issue, and that goes toward the repair if you book it. Want me to set up a visit?" },
    { role: "customer", text: "Just comparing prices for now, thanks." },
    { role: "assistant", text: "No problem at all — we're here 24/7 whenever you're ready." },
  ];
}

function unclearTranscript() {
  return [
    { role: "customer", text: "thing outside is frozen up again?? third time" },
    { role: "assistant", text: "That sounds frustrating — just to make sure I help with the right thing: is it the outdoor AC unit that's icing over?" },
    { role: "customer", text: "gotta go someone at the door" },
    { role: "assistant", text: "No worries! If you share your name and number, I'll have a tech call you to sort out the icing issue." },
  ];
}

function emergencyTranscript(name: string, phone: string) {
  return [
    { role: "customer", text: "I smell gas near my furnace, pretty strong" },
    { role: "assistant", text: "That's an emergency — please leave the house now, don't flip any switches, and call the gas company's emergency line from outside. I'm alerting our on-call tech immediately." },
    { role: "customer", text: `ok we're outside. ${name}, ${phone}` },
    { role: "assistant", text: "Good — stay outside. Our on-call tech has been notified and will call you within minutes." },
  ];
}

function voicemailTranscript() {
  return [
    { role: "customer", text: "[caller audio unclear]" },
    { role: "assistant", text: "I'm sorry, I didn't catch that. Could you repeat it?" },
    { role: "customer", text: "[caller audio unclear]" },
    { role: "assistant", text: "Let me take a message so the team can call you back. Please say your name, number, and what you need after the tone." },
  ];
}

// Hour-of-day weighting: mornings + late afternoons peak, a trickle overnight.
const HOUR_WEIGHTS = [2, 1, 1, 1, 1, 2, 4, 8, 12, 11, 9, 8, 7, 7, 8, 9, 11, 12, 9, 6, 5, 4, 3, 2];
function weightedHour(): number {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let h = 0; h < 24; h++) {
    r -= HOUR_WEIGHTS[h];
    if (r <= 0) return h;
  }
  return 12;
}

async function main() {
  console.log("Wiping existing demo-tenant activity…");
  for (const table of ["notifications_log", "bookings", "leads", "conversations", "insights"]) {
    const { error } = await db.from(table).delete().eq("business_id", BUSINESS_ID);
    if (error) throw new Error(`wipe ${table}: ${error.message}`);
  }

  // Make the tenant look fully configured so every feature lights up.
  const { error: bizError } = await db
    .from("businesses")
    .update({
      average_job_value_cents: 34500,
      owner_phone: "+15125550142",
      review_link: "https://g.page/r/cool-breeze-hvac/review",
      status: "active",
    })
    .eq("id", BUSINESS_ID);
  if (bizError) throw new Error(`business update: ${bizError.message}`);

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  let conversations = 0;
  let bookings = 0;
  let leads = 0;
  let notifications = 0;

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    // 2–8 conversations per day, busier recently (the business is growing).
    const base = 2 + Math.floor(rand() * 4);
    const growth = daysAgo < 10 ? 2 : 0;
    const count = base + growth;

    for (let i = 0; i < count; i++) {
      const hour = weightedHour();
      // Build the timestamp in *local* time so the peak-hours heatmap (which
      // renders in the viewer's timezone) shows the intended morning/evening
      // shape rather than a UTC-shifted one.
      const day = new Date(now - daysAgo * DAY);
      const createdAt = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        hour,
        Math.floor(rand() * 55),
      ).toISOString();
      const channel = chance(0.68) ? "chat" : "voice";
      const { name, phone } = person();
      const svc = pick(SERVICES);
      const time = pick(TIMES);

      // Outcome mix tuned so every dashboard state has examples.
      const roll = rand();
      const outcome: Outcome | null =
        roll < 0.36 ? "booked"
        : roll < 0.62 ? "no_action"
        : roll < 0.74 ? "unclear"
        : roll < 0.79 ? "emergency_escalated"
        : roll < 0.86 ? "voicemail_left"
        : null;

      const transcript =
        outcome === "booked" ? bookedTranscript(name, phone, svc.s, svc.problem, time)
        : outcome === "emergency_escalated" ? emergencyTranscript(name, phone)
        : outcome === "unclear" ? unclearTranscript()
        : outcome === "voicemail_left" ? voicemailTranscript()
        : noActionTranscript(svc.problem);

      const { data: conv, error: convError } = await db
        .from("conversations")
        .insert({
          business_id: BUSINESS_ID,
          channel,
          customer_name: outcome === "booked" || outcome === "emergency_escalated" ? name : chance(0.3) ? name : null,
          customer_phone: outcome === "booked" || outcome === "emergency_escalated" ? phone : chance(0.25) ? phone : null,
          transcript,
          outcome,
          ai_confidence_flag: outcome === "unclear" || (outcome === "voicemail_left" && chance(0.5)),
          created_at: createdAt,
        })
        .select("id")
        .single();
      if (convError) throw new Error(`conversation insert: ${convError.message}`);
      conversations++;

      if (outcome === "booked") {
        const status = chance(0.35) ? "new" : chance(0.6) ? "confirmed" : "owner_contacted";
        const { error: bookingError } = await db.from("bookings").insert({
          business_id: BUSINESS_ID,
          conversation_id: conv.id,
          customer_name: name,
          customer_phone: phone,
          requested_service: svc.s,
          preferred_time: time,
          notes: chance(0.4) ? `${Math.floor(rand() * 8000) + 100} ${pick(STREETS)} — ${svc.problem}` : null,
          status,
          created_at: createdAt,
        });
        if (bookingError) throw new Error(`booking insert: ${bookingError.message}`);
        bookings++;

        const { error: nError } = await db.from("notifications_log").insert({
          business_id: BUSINESS_ID,
          type: chance(0.8) ? "sms" : "email",
          status: chance(0.95) ? "sent" : "failed",
          reason: "booking_created",
          created_at: createdAt,
        });
        if (nError) throw new Error(`notification insert: ${nError.message}`);
        notifications++;
      } else if (outcome === "emergency_escalated") {
        const { error: nError } = await db.from("notifications_log").insert({
          business_id: BUSINESS_ID,
          type: "sms",
          status: "sent",
          reason: "emergency",
          created_at: createdAt,
        });
        if (nError) throw new Error(`notification insert: ${nError.message}`);
        notifications++;
      } else if (outcome === "unclear" || (outcome === "no_action" && chance(0.3))) {
        const reason = outcome === "unclear" ? (chance(0.5) ? "incomplete" : "needs_callback") : pick(["incomplete", "out_of_area", "needs_callback"] as const);
        const resolved = daysAgo > 7 && chance(0.55);
        const { error: leadError } = await db.from("leads").insert({
          business_id: BUSINESS_ID,
          conversation_id: conv.id,
          customer_name: chance(0.6) ? name : null,
          customer_phone: chance(0.7) ? phone : null,
          requested_service: chance(0.6) ? svc.s : null,
          preferred_time: chance(0.3) ? time : null,
          notes: chance(0.3) ? svc.problem : null,
          reason,
          resolved_at: resolved
            ? new Date(Date.parse(createdAt) + (1 + rand() * 3) * DAY).toISOString()
            : null,
          created_at: createdAt,
        });
        if (leadError) throw new Error(`lead insert: ${leadError.message}`);
        leads++;
      }
    }

    // Daily digest notification each evening.
    if (chance(0.9)) {
      const { error } = await db.from("notifications_log").insert({
        business_id: BUSINESS_ID,
        type: "email",
        status: "sent",
        reason: "digest",
        created_at: new Date(now - daysAgo * DAY - 4 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error(`digest notification: ${error.message}`);
      notifications++;
    }
  }

  console.log(
    `Seeded demo tenant: ${conversations} conversations, ${bookings} bookings, ${leads} leads, ${notifications} notifications.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
