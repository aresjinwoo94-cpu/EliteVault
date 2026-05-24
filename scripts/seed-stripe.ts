/**
 * Run with: npm run stripe:seed
 *
 * Creates the Pro & Scale products + monthly/yearly prices in your Stripe
 * account and prints the price IDs you should paste into .env.local.
 *
 * Idempotent: looks up by lookup_key before creating.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load .env.local (Next.js convention) — dotenv defaults to .env
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = join(__dirname, "..", ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

async function ensurePrice(opts: {
  productName: string;
  description: string;
  lookupKey: string;
  amount: number;
  interval: "month" | "year";
}) {
  const existing = await stripe.prices.list({
    lookup_keys: [opts.lookupKey],
    expand: ["data.product"],
    limit: 1,
  });
  if (existing.data[0]) {
    console.log(`  ✓ ${opts.lookupKey} already exists → ${existing.data[0].id}`);
    return existing.data[0].id;
  }

  // Reuse product if any
  let product = (
    await stripe.products.search({
      query: `name:'${opts.productName}'`,
      limit: 1,
    })
  ).data[0];
  if (!product) {
    product = await stripe.products.create({
      name: opts.productName,
      description: opts.description,
    });
  }
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: opts.amount * 100,
    currency: "usd",
    lookup_key: opts.lookupKey,
    recurring: { interval: opts.interval },
  });
  console.log(`  + ${opts.lookupKey} → ${price.id}`);
  return price.id;
}

async function main() {
  console.log("Seeding Stripe products & prices…\n");

  const proMonthly = await ensurePrice({
    productName: "EliteVault Pro",
    description: "Full Library + Analyzer with annotated screenshots",
    lookupKey: "elitevault_pro_monthly",
    amount: 19,
    interval: "month",
  });
  const proYearly = await ensurePrice({
    productName: "EliteVault Pro",
    description: "Full Library + Analyzer with annotated screenshots",
    lookupKey: "elitevault_pro_yearly",
    amount: 180,
    interval: "year",
  });
  const scaleMonthly = await ensurePrice({
    productName: "EliteVault Scale",
    description: "Pro + Auto-Rewrite, Meta Ads Optimizer & API",
    lookupKey: "elitevault_scale_monthly",
    amount: 49,
    interval: "month",
  });
  const scaleYearly = await ensurePrice({
    productName: "EliteVault Scale",
    description: "Pro + Auto-Rewrite, Meta Ads Optimizer & API",
    lookupKey: "elitevault_scale_yearly",
    amount: 499,
    interval: "year",
  });

  console.log("\n────────────────────────────────────────────");
  console.log("Paste into .env.local:");
  console.log("────────────────────────────────────────────");
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly}`);
  console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly}`);
  console.log(`STRIPE_PRICE_SCALE_MONTHLY=${scaleMonthly}`);
  console.log(`STRIPE_PRICE_SCALE_YEARLY=${scaleYearly}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
