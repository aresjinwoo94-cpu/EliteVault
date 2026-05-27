/**
 * Stripe + Supabase live diagnostic.
 *
 * Reads your local .env.local and reports EVERYTHING relevant to the
 * "I paid but my plan didn't upgrade" failure mode:
 *
 *   1. Which Stripe mode are we in? (test vs live, derived from key prefix)
 *   2. Are price-ID env vars set + do they exist in Stripe?
 *   3. List configured webhook endpoints + their event subscriptions
 *   4. Recent webhook delivery attempts for the checkout endpoint
 *   5. Recent checkout.session.completed events and whether they upgraded
 *      the user's profile in Supabase
 *
 * Read-only. Doesn't modify anything in Stripe or Supabase — pure observe.
 *
 * Usage:
 *   node scripts/diagnose-stripe.mjs
 *   node scripts/diagnose-stripe.mjs --email you@example.com
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

const emailArg = (() => {
  const i = process.argv.indexOf("--email");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
});
const svc = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const mode = env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
  ? "LIVE"
  : env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
    ? "TEST"
    : "UNKNOWN";

console.log("═".repeat(70));
console.log("STRIPE + SUPABASE DIAGNOSTIC");
console.log("═".repeat(70));
console.log(`Stripe mode (from local .env.local): ${mode}`);
console.log(`Supabase URL: ${env.NEXT_PUBLIC_SUPABASE_URL}`);

// ── 1. Price IDs ──
console.log("\n┌─ Price ID env vars ─────────────────────────────────────────");
const priceVars = [
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "STRIPE_PRICE_SCALE_MONTHLY",
  "STRIPE_PRICE_SCALE_YEARLY",
];
for (const name of priceVars) {
  const val = env[name];
  if (!val) {
    console.log(`│  ✗ ${name.padEnd(28)} (missing)`);
    continue;
  }
  try {
    const p = await stripe.prices.retrieve(val);
    const isLive = !val.includes("test");
    console.log(
      `│  ✓ ${name.padEnd(28)} ${val.slice(0, 24)}…  ${p.active ? "active" : "INACTIVE"}  $${(p.unit_amount / 100).toFixed(2)}`,
    );
  } catch (err) {
    console.log(`│  ✗ ${name.padEnd(28)} ${val.slice(0, 24)}…  NOT FOUND in ${mode} mode`);
  }
}

// ── 2. Webhooks ──
console.log("\n┌─ Configured webhook endpoints ──────────────────────────────");
const hooks = await stripe.webhookEndpoints.list({ limit: 20 });
if (hooks.data.length === 0) {
  console.log("│  ⚠ NO WEBHOOK ENDPOINTS configured in this Stripe mode.");
  console.log("│    That's why nothing fires after checkout.");
} else {
  for (const h of hooks.data) {
    console.log(`│`);
    console.log(`│  Endpoint: ${h.url}`);
    console.log(`│    ID: ${h.id}    status: ${h.status}`);
    console.log(`│    Events (${h.enabled_events.length}):`);
    const NEEDED = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ];
    const has = new Set(h.enabled_events);
    const wildcard = has.has("*");
    for (const ev of NEEDED) {
      const ok = wildcard || has.has(ev);
      console.log(`│      ${ok ? "✓" : "✗"} ${ev}`);
    }
    if (!h.enabled_events.some((e) => NEEDED.includes(e)) && !wildcard) {
      console.log(`│    ⚠ This endpoint is NOT listening to any event we need.`);
    }
  }
}

// ── 3. Recent webhook events (any type) ──
console.log("\n┌─ Recent Stripe events (last 10) ────────────────────────────");
const events = await stripe.events.list({ limit: 10 });
for (const e of events.data) {
  const age = Math.round((Date.now() - e.created * 1000) / 60000);
  console.log(`│  ${e.type.padEnd(40)} ${age}m ago  ${e.id}`);
}

// ── 4. Recent checkout sessions ──
console.log("\n┌─ Recent checkout sessions (last 5) ─────────────────────────");
const sessions = await stripe.checkout.sessions.list({ limit: 5 });
for (const s of sessions.data) {
  const age = Math.round((Date.now() - s.created * 1000) / 60000);
  const email = s.customer_details?.email ?? s.metadata?.email ?? "(no email)";
  console.log(
    `│  ${s.id.slice(0, 18)}…  ${s.status?.padEnd(8) ?? "?".padEnd(8)}  ${s.payment_status?.padEnd(8) ?? "?".padEnd(8)}  ${email}  ${age}m ago`,
  );
  if (s.subscription) {
    console.log(`│    → subscription: ${s.subscription}`);
  }
}

// ── 5. Per-user check (if --email passed) ──
if (emailArg) {
  console.log(`\n┌─ User check: ${emailArg} ──────────────────────────────`);
  const { data: profile } = await svc
    .from("profiles")
    .select("id, email, plan, credits, stripe_customer_id")
    .eq("email", emailArg.toLowerCase())
    .single();
  if (!profile) {
    console.log(`│  ✗ No profile found for ${emailArg}`);
  } else {
    console.log(`│  profile.id: ${profile.id}`);
    console.log(`│  plan in DB: ${profile.plan}   credits: ${profile.credits}`);
    console.log(`│  stripe_customer_id: ${profile.stripe_customer_id ?? "(none)"}`);
    if (profile.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
        limit: 10,
      });
      console.log(`│  Stripe subs for this customer (${mode} mode): ${subs.data.length}`);
      for (const s of subs.data) {
        const priceId = s.items.data[0]?.price.id ?? "—";
        console.log(`│    • ${s.id}  status=${s.status}  price=${priceId}`);
      }
      const active = subs.data.find(
        (s) => s.status === "active" || s.status === "trialing",
      );
      if (active && profile.plan === "free") {
        console.log(
          `│  ⚠ MISMATCH: Stripe has an active sub but DB says plan=free.`,
        );
        console.log(`│    Fix: node scripts/sync-stripe-plan.mjs ${emailArg} --write`);
      } else if (active) {
        console.log(`│  ✓ DB plan matches active subscription`);
      } else if (!active && profile.plan !== "free") {
        console.log(
          `│  ⚠ DB says ${profile.plan} but no active sub. Probably canceled.`,
        );
      }
    }
  }
}

console.log("\n═".repeat(70));
console.log("Diagnostic complete.");
