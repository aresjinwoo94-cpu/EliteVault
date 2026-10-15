import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReportUnlockSessionParams } from "../../lib/stripe/report-unlock-params";
import { CHECKOUT_PAYMENT_METHOD_TYPES } from "../../lib/stripe/payment-method-types";
import { REPORT_UNLOCK_USD_CENTS } from "../../lib/unlocks/report-unlock";

/** WP-3 (brief oct-2026 §5): the one-time unlock Checkout Session. */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const base = { customerId: "cus_1", customerEmail: "a@b.co", userId: "U1", analysisId: "A1", domain: "bombas.com" };

test("a one-time embedded payment at $7, priced in code, with Adaptive Pricing on", () => {
  const p = buildReportUnlockSessionParams({ ...base, locale: "en" });
  assert.equal(p.mode, "payment");
  assert.equal(p.ui_mode, "embedded");
  assert.equal(p.line_items?.length, 1);
  const li = p.line_items![0];
  assert.equal(li.quantity, 1);
  assert.ok(!("price" in li), "no Dashboard Price: the amount lives in code");
  assert.equal(li.price_data?.currency, "usd");
  assert.equal(li.price_data?.unit_amount, REPORT_UNLOCK_USD_CENTS);
  assert.equal(li.price_data?.unit_amount, 700);
  assert.equal(li.price_data?.product_data?.name, "EliteVault: full report unlock");
  assert.deepEqual(p.adaptive_pricing, { enabled: true });
});

test("never an invoice, a subscription, or the plan-checkout recovery event", () => {
  const p = buildReportUnlockSessionParams({ ...base, locale: "en" }) as Record<string, unknown>;
  assert.equal(p.invoice_creation, undefined, "an invoice would reach onInvoicePaid (hard-sets credits, emails a 'Free plan' receipt)");
  assert.equal(p.subscription_data, undefined);
  assert.equal(p.allow_promotion_codes, undefined);
  const src = read("lib/stripe/report-unlock-session.ts");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /checkout\/started|inngest\.send/);
});

test("metadata travels on the session AND its PaymentIntent (settlement + refunds key off it)", () => {
  const p = buildReportUnlockSessionParams({ ...base, locale: "en" });
  const md = { purchase: "report_unlock", supabase_user_id: "U1", analysis_id: "A1" };
  assert.deepEqual(p.metadata, md);
  assert.deepEqual(p.payment_intent_data?.metadata, md);
  assert.equal(p.payment_intent_data?.description, "EliteVault report unlock: bombas.com");
});

test("the site's language, never 'auto'; the copy under the pay button names the store", () => {
  const en = buildReportUnlockSessionParams({ ...base, locale: "en" });
  const es = buildReportUnlockSessionParams({ ...base, locale: "es" });
  assert.equal(en.locale, "en");
  assert.equal(es.locale, "es");
  assert.match((en.custom_text?.submit as { message?: string } | undefined)?.message ?? "", /One-time payment\. Unlocks the full report for bombas\.com\. No subscription\./);
  assert.match((es.custom_text?.submit as { message?: string } | undefined)?.message ?? "", /Pago único\. Desbloquea el reporte completo de bombas\.com\. Sin suscripción\./);
});

test("the shared payment-method list, a dedicated return URL, and a customer OR an email", () => {
  const p = buildReportUnlockSessionParams({ ...base, locale: "en" });
  assert.deepEqual(p.payment_method_types, [...CHECKOUT_PAYMENT_METHOD_TYPES]);
  assert.match(p.return_url ?? "", /\/app\/unlock\/return\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.equal(p.customer, "cus_1");
  assert.equal(p.customer_email, undefined);
  const guest = buildReportUnlockSessionParams({ ...base, customerId: null, locale: "en" });
  assert.equal(guest.customer, undefined);
  assert.equal(guest.customer_email, "a@b.co");
});

test("the checkout page guards on the server and exists only while the flag is on", () => {
  const page = read("app/(app)/app/unlock/[analysisId]/page.tsx");
  assert.match(page, /if \(!reportUnlockEnabledFor\(user\.email\)\) notFound\(\);/);
  assert.match(page, /redirect\(`\/sign-in\?next=/);
  assert.match(page, /eligibility\.kind === "not_found"\) notFound\(\)/);
  assert.match(page, /eligibility\.kind !== "ok"\) redirect\(`\/app\/analyzer\//);
  const guard = read("lib/unlocks/guard.ts");
  for (const rule of [/\.eq\("user_id", userId\)/, /a\.status !== "succeeded"/, /capture_blocked\?\.detected/, /plan !== "free"/, /isAnalysisUnlocked\(/]) assert.match(guard, rule);
  // no own price next to the Stripe form
  assert.doesNotMatch(page, /\$7|REPORT_UNLOCK_USD_CENTS|700/);
});

test("the return page settles for the signed-in buyer only, and is NOT behind the flag", () => {
  const ret = read("app/(app)/app/unlock/return/page.tsx");
  assert.match(ret, /session\.metadata\?\.supabase_user_id !== user\.id/);
  assert.match(ret, /settleReportUnlock\(session, createUnlockStore\(\)\)/);
  assert.doesNotMatch(ret, /reportUnlockEnabled/, "a buyer who paid is always settled, even if the flag is switched off");
  assert.match(ret, /unlock=canceled/);
  assert.match(read("components/billing/unlock-return.tsx"), /\/api\/unlocks\//);
  assert.match(read("components/billing/embedded-checkout.tsx"), /phCapture\("unlock_checkout_viewed"/);
});
