/**
 * Seed Live-mode Stripe products + prices.
 *
 * Same products as scripts/seed-stripe.ts (Pro + Scale × monthly + yearly)
 * but uses a Live secret key passed via CLI instead of pulling from
 * .env.local. This way you don't have to mutate .env.local + risk
 * leaving sk_live_* sitting in your local file after the seed.
 *
 * Usage:
 *   node scripts/seed-stripe-live.mjs sk_live_xxxxxxxxxxxxxxx
 *
 * Output:
 *   The 4 price IDs ready to paste into Vercel env vars.
 *
 * Idempotent: looks up each price by its lookup_key. If you re-run
 * the script it just prints the existing IDs without creating duplicates.
 */
import Stripe from "stripe";

const liveKey = process.argv[2];

if (!liveKey || !liveKey.startsWith("sk_live_")) {
  console.error(
    "Usage: node scripts/seed-stripe-live.mjs sk_live_xxxxxxx\n" +
      "Get your Live secret key from:\n" +
      "  https://dashboard.stripe.com/apikeys\n" +
      "(Make sure the Test/Live toggle is on Live in the top-right.)",
  );
  process.exit(1);
}

const stripe = new Stripe(liveKey, {
  apiVersion: "2025-04-30.basil",
});

async function ensurePrice(opts) {
  const wantAmount = opts.amount * 100;
  const existing = await stripe.prices.list({
    lookup_keys: [opts.lookupKey],
    expand: ["data.product"],
    limit: 1,
  });
  const found = existing.data[0];
  if (found && found.unit_amount === wantAmount) {
    console.log(`  ✓ ${opts.lookupKey} already exists → ${found.id}`);
    return found.id;
  }

  // Stripe prices are immutable: to change an amount we must create a NEW
  // price and atomically transfer the lookup_key onto it (transfer_lookup_key).
  // The old price is left inactive but existing subscriptions keep it.
  const transferLookupKey = Boolean(found);
  if (found) {
    console.log(
      `  ⟳ ${opts.lookupKey} amount changed (${found.unit_amount} → ${wantAmount}); creating new price`,
    );
  }

  // Reuse product — prefer the one attached to the existing price, then fall
  // back to name search / create so we don't spawn a duplicate product.
  let product =
    (found?.product && typeof found.product !== "string"
      ? found.product
      : undefined) ??
    (
      await stripe.products.search({
        query: `name:'${opts.productName}'`,
        limit: 1,
      })
    ).data[0];
  if (!product) {
    product = await stripe.products.create({
      name: opts.productName,
      description: opts.description,
      statement_descriptor: "ELITEVAULT",
    });
  }
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: wantAmount,
    currency: "usd",
    lookup_key: opts.lookupKey,
    transfer_lookup_key: transferLookupKey,
    recurring: { interval: opts.interval },
  });
  console.log(`  + ${opts.lookupKey} → ${price.id}`);
  return price.id;
}

console.log("Seeding LIVE-mode Stripe products & prices…\n");

const proMonthly = await ensurePrice({
  productName: "EliteVault Pro",
  description:
    "Full Library + brutal Analyzer with annotated screenshots, " +
    "buyer-persona simulations, and Community publishing.",
  lookupKey: "elitevault_pro_monthly",
  amount: 19,
  interval: "month",
});
const proYearly = await ensurePrice({
  productName: "EliteVault Pro",
  description:
    "Full Library + brutal Analyzer with annotated screenshots, " +
    "buyer-persona simulations, and Community publishing.",
  lookupKey: "elitevault_pro_yearly",
  amount: 180,
  interval: "year",
});
const scaleMonthly = await ensurePrice({
  productName: "EliteVault Scale",
  description:
    "Everything in Pro + Meta Campaign Scenario Modeler, " +
    "Meta Ads Optimizer, and REST API access.",
  lookupKey: "elitevault_scale_monthly",
  amount: 29,
  interval: "month",
});
const scaleYearly = await ensurePrice({
  productName: "EliteVault Scale",
  description:
    "Everything in Pro + Meta Campaign Scenario Modeler, " +
    "Meta Ads Optimizer, and REST API access.",
  lookupKey: "elitevault_scale_yearly",
  amount: 278,
  interval: "year",
});

console.log("\n──────────────────────────────────────────────");
console.log("Update these in Vercel → Environment Variables:");
console.log("──────────────────────────────────────────────");
console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly}`);
console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly}`);
console.log(`STRIPE_PRICE_SCALE_MONTHLY=${scaleMonthly}`);
console.log(`STRIPE_PRICE_SCALE_YEARLY=${scaleYearly}`);
console.log("──────────────────────────────────────────────");
console.log("\nAfter pasting, Vercel will redeploy automatically.");
