/**
 * Manual plan override. Useful when the dual-subscription mess leaves
 * profile.plan out of sync with what the user actually paid for.
 *
 * Usage:  node scripts/force-plan.mjs <email> <free|pro|scale>
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

const email = process.argv[2];
const plan = process.argv[3];
if (!email || !["free", "pro", "scale"].includes(plan)) {
  console.error("usage: node scripts/force-plan.mjs <email> <free|pro|scale>");
  process.exit(1);
}

const grants = { free: 1, pro: 40, scale: 200 };

const { error } = await svc
  .from("profiles")
  .update({ plan, credits: grants[plan] })
  .eq("email", email);
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`✓ ${email}  →  plan=${plan}, credits=${grants[plan]}`);
