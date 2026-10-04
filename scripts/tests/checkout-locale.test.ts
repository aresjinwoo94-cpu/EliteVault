import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messages } from "../../lib/i18n/messages";
import { PLANS } from "../../lib/stripe/plans";
import { localizePlan } from "../../lib/i18n/plan-text";
import { translator } from "../../lib/i18n/messages";
import {
  buildCheckoutSessionParams,
  stripeLocale,
} from "../../lib/stripe/checkout-params";
import { formatDate, formatPrice } from "../../lib/i18n/format";

/**
 * The checkout language contract: Stripe's Checkout and Billing Portal follow
 * the SITE's language, never the browser's. `locale: "auto"` used to leave
 * Stripe's panel (form, Link, coupon field) in the browser's language while
 * our half of the page was in the site's.
 */

const root = join(__dirname, "..", "..");
const code = (p: string) => readFileSync(join(root, p), "utf8");

const args = (locale: "en" | "es", plan: "pro" | "scale" = "pro") => ({
  customerId: "cus_test",
  price: "price_test",
  userId: "user_1",
  plan,
  interval: "month" as const,
  locale,
});

test("the Checkout Session is created in the site's language, never 'auto'", () => {
  assert.equal(buildCheckoutSessionParams(args("en")).locale, "en");
  assert.equal(buildCheckoutSessionParams(args("es")).locale, "es");
  for (const l of ["en", "es"] as const) {
    assert.notEqual(buildCheckoutSessionParams(args(l)).locale, "auto");
  }
  assert.equal(stripeLocale("en"), "en");
  assert.equal(stripeLocale("es"), "es");
});

const submitMessage = (p: ReturnType<typeof buildCheckoutSessionParams>) =>
  ((p.custom_text?.submit ?? {}) as { message?: string }).message;

test("the session's custom_text follows the same locale", () => {
  const en = submitMessage(buildCheckoutSessionParams(args("en", "pro")));
  const es = submitMessage(buildCheckoutSessionParams(args("es", "pro")));
  assert.match(en ?? "", /You're upgrading to EliteVault Pro\. Includes the full Analyzer/);
  assert.match(es ?? "", /Estás pasando a EliteVault Pro\. Incluye el Analyzer completo/);
  const scale = submitMessage(buildCheckoutSessionParams(args("es", "scale")));
  assert.match(scale ?? "", /EliteVault Scale/);
  assert.doesNotMatch(scale ?? "", /\{plan\}|\{includes\}/, "no placeholder may leak");
});

test("the locale change touched nothing else on the session", () => {
  const p = buildCheckoutSessionParams(args("es"));
  assert.equal(p.ui_mode, "embedded");
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: "price_test", quantity: 1 }]);
  assert.deepEqual(p.adaptive_pricing, { enabled: true });
  assert.equal(p.allow_promotion_codes, true);
  assert.deepEqual(p.metadata, { supabase_user_id: "user_1", plan: "pro" });
  assert.match(p.return_url ?? "", /\/app\/checkout\/return\?session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test("no Stripe session or portal in the repo may use locale 'auto'", () => {
  for (const f of [
    "lib/stripe/checkout-params.ts",
    "lib/stripe/checkout-session.ts",
    "app/api/stripe/portal/route.ts",
    "app/api/stripe/checkout/route.ts",
  ]) {
    assert.doesNotMatch(
      code(f).replace(/\/\/.*$/gm, ""),
      /locale:\s*["']auto["']/,
      `${f} must not use locale: "auto"`,
    );
  }
  // The portal takes the site's language from getT() through the same mapper.
  const portal = code("app/api/stripe/portal/route.ts");
  assert.match(portal, /locale: stripeLocale\(locale\)/);
  assert.match(portal, /await getT\(\)/);
  // …and both callers of the session builder pass the locale.
  assert.match(code("app/(app)/app/checkout/page.tsx"), /^\s+locale,\s*$/m);
  assert.match(code("app/api/stripe/checkout/route.ts"), /locale: await getLocale\(\)/);
});

// ── parity of the copy this PR added ────────────────────────────────────
function flatten(o: unknown, prefix = ""): string[] {
  if (typeof o === "string") return [prefix];
  if (typeof o !== "object" || o === null) return [];
  return Object.entries(o).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

test("checkout / billing / plans copy exists in en AND es", () => {
  for (const ns of ["checkout", "billing", "plans"]) {
    const en = flatten((messages.en as Record<string, unknown>)[ns]).sort();
    const es = flatten((messages.es as Record<string, unknown>)[ns]).sort();
    assert.ok(en.length > 0, `${ns} missing in en`);
    assert.deepEqual(es, en, `${ns}: es keys must match en keys`);
  }
});

test("placeholders match between en and es", () => {
  const get = (loc: "en" | "es", path: string): string => {
    let cur: unknown = messages[loc];
    for (const k of path.split(".")) cur = (cur as Record<string, unknown>)[k];
    return cur as string;
  };
  for (const ns of ["checkout", "billing", "plans"]) {
    for (const key of flatten((messages.en as Record<string, unknown>)[ns])) {
      const path = `${ns}.${key}`;
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
      assert.equal(ph(get("es", path)), ph(get("en", path)), `placeholders differ: ${path}`);
    }
  }
});

test("the English plan copy is exactly plans.ts (no drift between the two)", () => {
  const t = translator("en");
  for (const plan of Object.values(PLANS)) {
    const l = localizePlan(plan, t);
    assert.equal(l.name, plan.name);
    assert.equal(l.description, plan.description);
    assert.equal(l.tagline, plan.tagline);
    assert.equal(l.badge, plan.badge);
    assert.deepEqual(
      l.features.map((f) => f.text),
      plan.features.map((f) => f.text),
      `${plan.id} features`,
    );
  }
});

test("Spanish plan copy translates every field and keeps included/highlight", () => {
  const t = translator("es");
  for (const plan of Object.values(PLANS)) {
    const l = localizePlan(plan, t);
    assert.notEqual(l.description, plan.description, `${plan.id} description`);
    assert.notEqual(l.tagline, plan.tagline, `${plan.id} tagline`);
    l.features.forEach((f, i) => {
      assert.notEqual(f.text, plan.features[i].text, `${plan.id}.f${i}`);
      assert.equal(f.included, plan.features[i].included);
      assert.equal(f.highlight, plan.features[i].highlight);
    });
  }
});

test("dates and prices use the site's locale on these screens", () => {
  assert.equal(formatPrice(19, "en"), "$19");
  assert.match(formatPrice(19, "es"), /USD\s?19/);
  assert.match(formatDate("2026-10-03T12:00:00Z", "en"), /Oct/);
  assert.match(formatDate("2026-10-03T12:00:00Z", "es"), /oct/);
});
