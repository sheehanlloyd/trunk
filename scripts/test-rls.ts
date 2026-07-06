/**
 * Phase 7 — cross-tenant isolation + billing-lapse integration test
 * (task items 10 and 9), run against a LOCAL Supabase.
 *
 * Item 10 is the one that must be proven at the DATABASE layer, not the UI: this
 * script authenticates as one business's owner and then actively tries to read
 * and write the OTHER business's rows. Every attempt must come back empty / have
 * no effect because of the RLS policies in supabase/migrations/0002_rls_policies
 * (and 0004 for leads) — nothing here relies on application code hiding data.
 *
 * Item 9: pausing a business must not lose data — we pause a tenant via the
 * service role and confirm its conversations/bookings rows still exist.
 *
 * Prereqs:
 *   npx supabase start           # boots local Postgres/Auth on :54321/:54322
 *   npx supabase db reset        # applies migrations + seeds the two tenants
 *   npx tsx scripts/test-rls.ts
 *
 * It refuses to run against a non-local Supabase URL unless ALLOW_REMOTE_RLS_TEST
 * is set, so it can never touch production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

// Seeded tenant ids (supabase/seed.sql).
const COOL_BREEZE = "11111111-1111-1111-1111-111111111111";
const RAPID = "22222222-2222-2222-2222-222222222222";
const OWNER_A = { email: "owner@coolbreeze.test", password: "test-password-a1!" };
const OWNER_B = { email: "owner@rapidplumb.test", password: "test-password-b2!" };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail = ""): void {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${pass || !detail ? "" : ` — ${detail}`}`);
}

async function main(): Promise<void> {
  if (!url || !anonKey || !serviceKey) {
    throw new Error("Missing Supabase URL / anon key / service role key in env.");
  }
  if (!/localhost|127\.0\.0\.1/.test(url) && !process.env.ALLOW_REMOTE_RLS_TEST) {
    throw new Error(
      `Refusing to run against non-local Supabase (${url}). ` +
        `Set ALLOW_REMOTE_RLS_TEST=1 to override (NOT recommended).`,
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Sanity: the seed must be loaded, or the test would trivially "pass".
  const { data: seedBiz, error: seedErr } = await admin
    .from("businesses")
    .select("id")
    .in("id", [COOL_BREEZE, RAPID]);
  if (seedErr) throw new Error(`Cannot reach DB: ${seedErr.message}`);
  if ((seedBiz ?? []).length !== 2) {
    throw new Error(
      "Seed tenants not found. Run `npx supabase db reset` first (applies migrations + seed).",
    );
  }

  // Create the two auth users; the 0003 trigger links them to the invited
  // business_users rows by email. Idempotent across reruns.
  for (const u of [OWNER_A, OWNER_B]) {
    const { error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error && !/already|registered|exists/i.test(error.message)) {
      throw new Error(`createUser(${u.email}) failed: ${error.message}`);
    }
  }

  // Sign in as owner A (Cool Breeze) with the anon key → an RLS-scoped client.
  const a: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await a.auth.signInWithPassword(OWNER_A);
  if (signInErr) throw new Error(`Owner A sign-in failed: ${signInErr.message}`);

  // Confirm the trigger actually linked A to Cool Breeze (positive control).
  const { data: myBiz } = await a.from("businesses").select("id, name");
  check(
    "A sees exactly its own business (Cool Breeze)",
    (myBiz ?? []).length === 1 && myBiz?.[0]?.id === COOL_BREEZE,
    `saw ${JSON.stringify(myBiz)}`,
  );

  // --- Cross-tenant READS: every one must come back empty ---------------------
  const readProbes: { table: string }[] = [
    { table: "conversations" },
    { table: "bookings" },
    { table: "leads" },
    { table: "knowledge_corrections" },
    { table: "notifications_log" },
  ];
  for (const p of readProbes) {
    const { data } = await a.from(p.table).select("*").eq("business_id", RAPID);
    check(
      `A cannot read B's ${p.table}`,
      (data ?? []).length === 0,
      `leaked ${(data ?? []).length} row(s)`,
    );
  }
  // Direct read of B's business row by id.
  const { data: bBiz } = await a.from("businesses").select("*").eq("id", RAPID);
  check("A cannot read B's business row", (bBiz ?? []).length === 0, `leaked ${(bBiz ?? []).length}`);

  // A blanket select (no filter) must still only ever return A's own rows.
  const { data: allConvos } = await a.from("conversations").select("business_id");
  const foreign = (allConvos ?? []).filter((r) => r.business_id !== COOL_BREEZE);
  check(
    "A's unfiltered conversation read contains no foreign rows",
    foreign.length === 0,
    `${foreign.length} foreign row(s) visible`,
  );

  // --- Cross-tenant WRITES: must have no effect -------------------------------
  // Update B's business name as A → RLS should match 0 rows.
  const { data: updRows } = await a
    .from("businesses")
    .update({ name: "HACKED BY TENANT A" })
    .eq("id", RAPID)
    .select();
  check("A's UPDATE of B's business affects 0 rows", (updRows ?? []).length === 0);

  // Insert a conversation for B as A → the WITH CHECK policy should reject it.
  const { data: insRows, error: insErr } = await a
    .from("conversations")
    .insert({ business_id: RAPID, channel: "chat", transcript: [], ai_confidence_flag: false })
    .select();
  check(
    "A's INSERT of a conversation into B is rejected",
    (insRows ?? []).length === 0 && insErr != null,
    insErr ? "" : "insert unexpectedly succeeded",
  );

  // Ground truth via service role: B's name is untouched and no A-inserted row exists.
  const { data: bAfter } = await admin
    .from("businesses")
    .select("name")
    .eq("id", RAPID)
    .single<{ name: string }>();
  check(
    "B's business row is unchanged at the DB level",
    bAfter?.name === "Rapid Response Plumbing",
    `name is now "${bAfter?.name}"`,
  );

  // --- Item 9: pausing preserves all data ------------------------------------
  const { count: convosBefore } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", COOL_BREEZE);
  const { count: bookingsBefore } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("business_id", COOL_BREEZE);

  await admin.from("businesses").update({ status: "paused" }).eq("id", COOL_BREEZE);

  const { data: pausedBiz } = await admin
    .from("businesses")
    .select("status")
    .eq("id", COOL_BREEZE)
    .single<{ status: string }>();
  const { count: convosAfter } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", COOL_BREEZE);
  const { count: bookingsAfter } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("business_id", COOL_BREEZE);

  check(
    "pausing preserves conversations + bookings (no data loss)",
    pausedBiz?.status === "paused" &&
      convosBefore === convosAfter &&
      bookingsBefore === bookingsAfter,
    `status=${pausedBiz?.status} convos ${convosBefore}->${convosAfter} bookings ${bookingsBefore}->${bookingsAfter}`,
  );

  // Restore so reruns start clean-ish.
  await admin.from("businesses").update({ status: "active" }).eq("id", COOL_BREEZE);

  // --- Summary ---------------------------------------------------------------
  const failed = results.filter((r) => !r.pass);
  console.log("\n" + "=".repeat(78));
  console.log(`RLS / isolation: ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`);
  }
  console.log("=".repeat(78));
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("\n[rls test error]", err);
  process.exitCode = 1;
});
