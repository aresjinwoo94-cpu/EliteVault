/**
 * Grant (ADD) credits to a single account by email.
 *
 *   node scripts/grant-credits.mjs --email <email> --add <n> [--dry-run]
 *
 * - Reads .env.local for the Supabase service role (never printed).
 * - Matches the profile by EXACT email, case-insensitive. Aborts without
 *   writing if it finds 0 or more than 1 match.
 * - ADDS to the current balance (credits = credits + n); it never overwrites.
 * - n must be an integer 1..500; anything else aborts.
 * - --dry-run reports what it WOULD do and writes nothing.
 *
 * NOTE: paid-plan renewals hard-SET credits in the Stripe webhook
 * (app/api/stripe/webhook/route.ts), so a manual grant on a pro/scale account
 * is overwritten at the next billing period. The script reports the plan so
 * that's visible.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--email") out.email = argv[++i];
    else if (a === "--add") out.add = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const email = (args.email ?? "").trim();
if (!email || !email.includes("@")) {
  console.error("Abort: --email <email> is required and must look like an email.");
  process.exit(1);
}

const n = Number(args.add);
if (!Number.isInteger(n) || n < 1 || n > 500) {
  console.error(`Abort: --add must be an integer between 1 and 500 (got ${JSON.stringify(args.add)}).`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Abort: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
  process.exit(1);
}

const svc = createClient(url, key, { auth: { persistSession: false } });

// Case-insensitive exact match. ilike with no wildcards is a case-insensitive
// equality; we still filter in JS to be safe against % / _ in the input, and to
// enforce the "exactly one" rule ourselves.
const { data: rows, error } = await svc
  .from("profiles")
  .select("id, email, plan, credits")
  .ilike("email", email);

if (error) {
  console.error("Abort: query failed:", error.message);
  process.exit(1);
}

const matches = (rows ?? []).filter(
  (r) => typeof r.email === "string" && r.email.toLowerCase() === email.toLowerCase(),
);

if (matches.length !== 1) {
  console.error(
    `Abort: expected exactly 1 profile for "${email}", found ${matches.length}. Nothing written.`,
  );
  process.exit(1);
}

const p = matches[0];
const before = Number(p.credits ?? 0);
const after = before + n;

console.log(`Account : ${p.email}`);
console.log(`Plan    : ${p.plan}`);
console.log(`Credits : ${before} → ${after}  (adding ${n})`);

if (args.dryRun) {
  console.log("\n--dry-run: nothing was written.");
} else {
  const { error: upErr } = await svc
    .from("profiles")
    .update({ credits: after })
    .eq("id", p.id);

  if (upErr) {
    console.error("Abort: update failed:", upErr.message);
    process.exit(1);
  }

  console.log("\n✓ Done. Credits updated.");
  if (p.plan === "pro" || p.plan === "scale") {
    console.log(
      "⚠ This is a PAID plan: the Stripe webhook hard-sets credits on the next\n" +
        "  renewal, so this manual grant will be overwritten then.",
    );
  }
}
