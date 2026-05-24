/**
 * Re-grants the monthly credit allotment to every user whose
 * profile.plan != 'free' but credits == 0 (the side-effect of the
 * pre-fix onInvoicePaid bug). Idempotent.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const GRANTS = { free: 0, pro: 40, scale: 200 };

const { data: profiles } = await svc
  .from("profiles")
  .select("id, email, plan, credits");

for (const p of profiles ?? []) {
  const expected = GRANTS[p.plan];
  if (expected > 0 && p.credits < expected) {
    await svc
      .from("profiles")
      .update({ credits: expected })
      .eq("id", p.id);
    console.log(`✓ ${p.email.padEnd(35)} ${p.plan}: ${p.credits} → ${expected}`);
  } else {
    console.log(`  ${p.email.padEnd(35)} ${p.plan}: ${p.credits} (no change)`);
  }
}

console.log("\nDone.");
