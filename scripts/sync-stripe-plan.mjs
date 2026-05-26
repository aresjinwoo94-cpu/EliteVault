/**
 * Manual Stripe → Supabase plan sync.
 *
 * Escape hatch for the case where a webhook failed to fire (test/live
 * secret mismatch, network blip, Vercel cold start race, etc.) and a
 * user's profile.plan is stuck on "free" despite an active paid
 * subscription in Stripe.
 *
 * Usage:
 *   node scripts/sync-stripe-plan.mjs <email>            (dry run, prints)
 *   node scripts/sync-stripe-plan.mjs <email> --write    (actually update)
 *
 * Flow:
 *   1. Find the profile row by email
 *   2. Look up their stripe_customer_id
 *   3. Fetch active subscriptions from Stripe for that customer
 *   4. Pick the first active/trialing subscription
 *   5. Map its price_id → plan (pro / scale)
 *   6. Update profiles.plan + grant monthly credits + upsert subscriptions row
 *
 * Works for both Test mode and Live mode — uses whichever STRIPE_SECRET_KEY
 * is in .env.local at the time you run it.
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);

const email = process.argv[2];
const WRITE = process.argv.includes("--write");

if (!email || email.startsWith("--")) {
  console.error("Usage: node scripts/sync-stripe-plan.mjs <email> [--write]");
  process.exit(1);
}

const svc = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
});

// Plan resolution — mirror lib/stripe/plans.ts. Reading env directly because
// we're in a script, not a Next.js module.
const PLAN_PRICE_MAP = new Map([
  [env.STRIPE_PRICE_PRO_MONTHLY, { plan: "pro", credits: 40 }],
  [env.STRIPE_PRICE_PRO_YEARLY, { plan: "pro", credits: 40 }],
  [env.STRIPE_PRICE_SCALE_MONTHLY, { plan: "scale", credits: 200 }],
  [env.STRIPE_PRICE_SCALE_YEARLY, { plan: "scale", credits: 200 }],
]);
PLAN_PRICE_MAP.delete(undefined);
PLAN_PRICE_MAP.delete("");

// ── 1. Profile lookup ──
console.log(`\nLooking up profile for ${email}…`);
const { data: profile, error: pErr } = await svc
  .from("profiles")
  .select("id, email, plan, credits, stripe_customer_id, full_name")
  .eq("email", email.toLowerCase())
  .single();
if (pErr || !profile) {
  console.error(`✗ No profile found for ${email}`);
  process.exit(1);
}
console.log(`  ✓ profile.id: ${profile.id}`);
console.log(`  ✓ current plan: ${profile.plan}, credits: ${profile.credits}`);
console.log(`  ✓ stripe_customer_id: ${profile.stripe_customer_id ?? "(none)"}`);

if (!profile.stripe_customer_id) {
  console.error(
    "\n✗ This profile has no stripe_customer_id. The checkout flow attaches\n" +
      "  one on first attempt — if it's missing, the user never made it past\n" +
      "  the Stripe page. Nothing to sync.",
  );
  process.exit(1);
}

// ── 2. Active subscriptions ──
console.log("\nFetching subscriptions from Stripe…");
const subs = await stripe.subscriptions.list({
  customer: profile.stripe_customer_id,
  status: "all",
  limit: 10,
  expand: ["data.items.data.price"],
});
if (subs.data.length === 0) {
  console.error("\n✗ No subscriptions found in Stripe for this customer.");
  console.error("  Either the checkout never completed, or the customer ID");
  console.error("  in our DB doesn't match the real Stripe customer.");
  process.exit(1);
}

console.log(`  Found ${subs.data.length} subscription(s):`);
for (const s of subs.data) {
  const priceId = s.items.data[0]?.price.id ?? "—";
  const planMatch = PLAN_PRICE_MAP.get(priceId);
  console.log(
    `    • ${s.id}  status=${s.status}  price=${priceId}  →  ${planMatch?.plan ?? "(unknown)"}`,
  );
}

const active = subs.data.find(
  (s) => s.status === "active" || s.status === "trialing",
);
if (!active) {
  console.error("\n✗ No active/trialing subscription. User is correctly on free.");
  process.exit(0);
}

const priceId = active.items.data[0]?.price.id ?? "";
const planInfo = PLAN_PRICE_MAP.get(priceId);
if (!planInfo) {
  console.error(
    `\n✗ Subscription has price_id "${priceId}" which doesn't match any\n` +
      "  configured STRIPE_PRICE_* env var. Check your .env.local — the\n" +
      "  test-mode price IDs are DIFFERENT from live-mode price IDs.",
  );
  console.error("\n  Configured price IDs in this env:");
  for (const [pid, info] of PLAN_PRICE_MAP.entries()) {
    console.error(`    ${info.plan.padEnd(6)} ${pid}`);
  }
  process.exit(1);
}

console.log(
  `\n→ User should be on: ${planInfo.plan} (${planInfo.credits} credits)`,
);
if (profile.plan === planInfo.plan && profile.credits >= planInfo.credits) {
  console.log("  ✓ Already in sync — no action needed.");
  process.exit(0);
}

if (!WRITE) {
  console.log("\nDry run — pass --write to apply.");
  process.exit(0);
}

// ── 3. Apply ──
console.log("\nApplying…");

await svc.from("subscriptions").upsert(
  {
    id: active.id,
    user_id: profile.id,
    status: active.status,
    price_id: priceId,
    plan: planInfo.plan,
    current_period_start: new Date(
      active.current_period_start * 1000,
    ).toISOString(),
    current_period_end: new Date(
      active.current_period_end * 1000,
    ).toISOString(),
    cancel_at_period_end: active.cancel_at_period_end,
    trial_end: active.trial_end
      ? new Date(active.trial_end * 1000).toISOString()
      : null,
  },
  { onConflict: "id" },
);
console.log("  ✓ subscriptions upserted");

await svc
  .from("profiles")
  .update({ plan: planInfo.plan, credits: planInfo.credits })
  .eq("id", profile.id);
console.log(
  `  ✓ profile updated → plan=${planInfo.plan}, credits=${planInfo.credits}`,
);

console.log("\n✓ Sync complete. User should now see the upgraded plan.");
