/**
 * WP-3 — TEST-MODE check of the one-time unlock Checkout Session (never run with live keys).
 *   npx tsx --tsconfig scripts/tests/tsconfig.json scripts/e2e/unlock-session-check.mts --env <.env.local> [--hosted]
 * Creates a session from the SAME params builder the app uses and prints what Stripe echoes back
 * (mode, amount, currency, adaptive pricing, metadata). With --hosted it also creates a hosted-page twin so
 * the localized price (Adaptive Pricing) can be looked at in a browser.
 */
import { readFileSync } from "node:fs";
const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
for (const l of readFileSync(arg("--env", ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
if (!String(process.env.STRIPE_SECRET_KEY).startsWith("sk_test_")) throw new Error("TEST keys only");
process.env.NEXT_PUBLIC_APP_URL ??= "https://elitevaultapp.com";
const { default: Stripe } = await import("stripe");
const { buildReportUnlockSessionParams } = await import("../../lib/stripe/report-unlock-params");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" as never });

const params = buildReportUnlockSessionParams({ customerId: null, customerEmail: "unlock-test@example.com", userId: "00000000-0000-0000-0000-000000000001", analysisId: "00000000-0000-0000-0000-0000000000aa", domain: "bombas.com", locale: arg("--locale", "en") as "en" | "es" });
const s = await stripe.checkout.sessions.create(params);
console.log(JSON.stringify({ id: s.id, mode: s.mode, ui_mode: (s as { ui_mode?: string }).ui_mode, amount_total: s.amount_total, currency: s.currency, adaptive_pricing: (s as { adaptive_pricing?: unknown }).adaptive_pricing, metadata: s.metadata, payment_intent: s.payment_intent, invoice: (s as { invoice?: unknown }).invoice, has_client_secret: Boolean(s.client_secret) }, null, 2));
if (argv.includes("--hosted")) {
  const { ui_mode: _u, return_url: _r, ...rest } = params as Record<string, unknown>;
  void _u; void _r;
  const h = await stripe.checkout.sessions.create({ ...(rest as object), success_url: "https://elitevaultapp.com/app/unlock/return?session_id={CHECKOUT_SESSION_ID}", cancel_url: "https://elitevaultapp.com/app" } as never);
  console.log("HOSTED_URL", h.url);
}
