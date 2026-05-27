/**
 * Verify Stripe Live mode setup end-to-end.
 *
 * Pass your Live secret key as a CLI arg. The script will:
 *   1. Confirm the key is actually a Live key (sk_live_*)
 *   2. List all Live mode webhook endpoints + which events they listen to
 *   3. Verify each of the 4 expected price IDs exists in Live
 *
 * Run AFTER seeding products + updating Vercel env vars. The 4 price IDs
 * are read from .env.local (which by this point you should have updated
 * locally too) OR pass them via env override.
 *
 * Usage:
 *   node scripts/verify-stripe-live.mjs sk_live_xxxxxxx
 *
 * Read-only. Doesn't modify anything in Stripe or your DB.
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";

const liveKey = process.argv[2];
if (!liveKey || !liveKey.startsWith("sk_live_")) {
  console.error("Usage: node scripts/verify-stripe-live.mjs sk_live_xxxxxxx");
  process.exit(1);
}

// Read the price IDs from local .env.local so we know what to verify.
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")).trim(),
        l.slice(l.indexOf("=") + 1).trim(),
      ]),
  );
} catch {
  console.warn("(no .env.local found — will skip price verification)");
}

const stripe = new Stripe(liveKey, { apiVersion: "2025-04-30.basil" });

console.log("═".repeat(68));
console.log("STRIPE LIVE MODE VERIFICATION");
console.log("═".repeat(68));

// 1. Account check
try {
  const account = await stripe.accounts.retrieve();
  console.log(`\nAccount: ${account.id}`);
  console.log(
    `  charges_enabled: ${account.charges_enabled ? "✓ YES" : "✗ NO"}`,
  );
  console.log(
    `  payouts_enabled: ${account.payouts_enabled ? "✓ YES" : "✗ NO"}`,
  );
  console.log(`  country: ${account.country}`);
  console.log(`  default_currency: ${account.default_currency}`);
  if (!account.charges_enabled) {
    console.log(
      "\n  ⚠ Live charges NOT enabled. Stripe activation is still pending,\n" +
        "    or you have outstanding requirements. Check:\n" +
        "    https://dashboard.stripe.com/account/onboarding",
    );
  }
} catch (err) {
  console.error("✗ Account check failed:", err.message);
  console.error("   Is the key really a Live mode sk_live_* key?");
  process.exit(1);
}

// 2. Price verification
console.log("\n─ Price IDs in Live mode ────────────────────────────────────");
const priceVars = [
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "STRIPE_PRICE_SCALE_MONTHLY",
  "STRIPE_PRICE_SCALE_YEARLY",
];
let allPricesOk = true;
for (const name of priceVars) {
  const val = env[name];
  if (!val) {
    console.log(`  ⚠ ${name.padEnd(28)} not set in local .env.local`);
    continue;
  }
  try {
    const p = await stripe.prices.retrieve(val);
    const amount = `$${(p.unit_amount / 100).toFixed(2)}`;
    console.log(
      `  ✓ ${name.padEnd(28)} ${val.slice(0, 22)}…  ${amount}  ${
        p.active ? "active" : "INACTIVE"
      }`,
    );
  } catch (err) {
    console.log(
      `  ✗ ${name.padEnd(28)} ${val.slice(0, 22)}…  NOT FOUND in Live`,
    );
    allPricesOk = false;
  }
}

// 3. Webhooks in Live mode
console.log("\n─ Live mode webhook endpoints ───────────────────────────────");
const NEEDED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

try {
  const hooks = await stripe.webhookEndpoints.list({ limit: 20 });
  if (hooks.data.length === 0) {
    console.log(
      "  ⚠ NO webhook endpoints in Live mode. You created the Test one,\n" +
        "    but Stripe needs a SEPARATE webhook for Live mode. Create it:\n" +
        "    https://dashboard.stripe.com/webhooks   (Live mode toggle ON)",
    );
  } else {
    for (const h of hooks.data) {
      console.log(`\n  Endpoint: ${h.url}`);
      console.log(`    Status: ${h.status}`);
      const enabled = new Set(h.enabled_events);
      const wildcard = enabled.has("*");
      let missingCount = 0;
      for (const ev of NEEDED_EVENTS) {
        const ok = wildcard || enabled.has(ev);
        console.log(`      ${ok ? "✓" : "✗"} ${ev}`);
        if (!ok) missingCount++;
      }
      if (missingCount > 0) {
        console.log(
          `    ⚠ ${missingCount} required event(s) not subscribed`,
        );
      }
    }
  }
} catch (err) {
  console.error("✗ Webhook list failed:", err.message);
}

console.log("\n" + "═".repeat(68));
if (allPricesOk) {
  console.log("✓ Local price IDs all exist in Live mode.");
  console.log(
    "  Make sure these same IDs are also set in Vercel env vars\n" +
      "  (Production + Preview).",
  );
} else {
  console.log("✗ Some price IDs are missing from Live mode.");
  console.log(
    "  Run: node scripts/seed-stripe-live.mjs sk_live_xxx\n" +
      "  Then paste the printed IDs into Vercel + .env.local.",
  );
}
