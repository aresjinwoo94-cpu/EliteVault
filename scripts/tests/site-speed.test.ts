import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Guards for the site-speed work (docs/i18n-checkout-and-auto-locale.md, PR 3).
 * They pin the regressions that are easy to reintroduce by accident: a static
 * import of a heavy library, a JS-driven height animation, a site-wide Stripe
 * preconnect, an extra serial Stripe call on the path to the payment form.
 */

const root = join(__dirname, "..", "..");
const code = (p: string) => readFileSync(join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const files = ["app", "components", "lib"].flatMap((d) => walk(join(root, d)));
const rel = (f: string) => relative(root, f).split(sep).join("/");

test("the FAQ is a Server Component on native <details>: no client JS, no framer-motion", () => {
  const faq = code("components/marketing/faq.tsx");
  assert.doesNotMatch(faq, /["']use client["']/);
  assert.doesNotMatch(faq, /from ["']framer-motion["']/);
  assert.match(faq, /<details/);
  assert.match(faq, /<summary/);
  // CSS-driven open/close (no `height: auto` animated from script)
  assert.match(code("app/globals.css"), /\.faq-item::details-content/);
});

test("no component animates `height` from JavaScript (layout every frame on a phone)", () => {
  const offenders = files
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => /height:\s*["']auto["']/.test(readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(offenders, []);
});

test("framer-motion: components use the light `m` under one LazyMotion provider", () => {
  const heavy = files
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => /import\s*\{\s*motion\b[^}]*\}\s*from\s*["']framer-motion["']/.test(readFileSync(f, "utf8")))
    .map(rel)
    // the analyzer progress screen is deliberately left untouched (PR 3 scope)
    .filter((f) => f !== "components/analyzer/analyzing-state.tsx");
  assert.deepEqual(heavy, [], "import { m as motion } instead — the full `motion` ships every feature");
  const provider = code("components/motion/lazy-motion-provider.tsx");
  assert.match(provider, /LazyMotion/);
  assert.match(provider, /domAnimation/);
  assert.match(code("app/layout.tsx"), /<MotionProvider>/);
});

test("posthog-js is only ever imported dynamically (it is ~100 KB gzip)", () => {
  const offenders = files
    .filter((f) => !f.endsWith("lib/analytics/posthog.ts") && !f.includes(`${sep}admin${sep}`))
    .filter((f) => /from\s+["']posthog-js(\/react)?["']/.test(readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(offenders, []);
  const facade = code("lib/analytics/posthog.ts");
  assert.match(facade, /await import\("posthog-js"\)/);
  assert.doesNotMatch(facade, /^import .*from ["']posthog-js/m);
  // …loaded when idle, and later on the checkout so it does not fight Stripe
  const provider = code("components/analytics/posthog-provider.tsx");
  assert.match(provider, /requestIdleCallback/);
  assert.match(provider, /\/app\/checkout/);
});

test("the support chat and the ⌘K palette load on demand, not with every page", () => {
  assert.match(code("app/layout.tsx"), /SupportChatLazy/);
  assert.doesNotMatch(code("app/layout.tsx"), /import\s*\{\s*SupportChat\s*\}/);
  assert.match(code("components/support/support-chat-lazy.tsx"), /dynamic\(/);
  assert.match(code("app/(app)/layout.tsx"), /CommandMenuLazy/);
  assert.doesNotMatch(code("app/(app)/layout.tsx"), /import\s*\{\s*CommandMenu\s*\}/);
  assert.match(code("components/dashboard/command-menu-lazy.tsx"), /dynamic\(/);
});

test("checkout: Stripe preconnects live on checkout + billing only, never site-wide", () => {
  for (const f of ["app/(app)/app/checkout/page.tsx", "app/(app)/app/billing/page.tsx"]) {
    assert.match(code(f), /rel="preconnect" href="https:\/\/js\.stripe\.com"/, f);
  }
  const checkout = code("app/(app)/app/checkout/page.tsx");
  for (const h of ["js.stripe.com", "api.stripe.com", "m.stripe.network", "hooks.stripe.com"]) {
    assert.ok(checkout.includes(`rel="preconnect" href="https://${h}"`), `preconnect ${h}`);
    assert.ok(checkout.includes(`rel="dns-prefetch" href="https://${h}"`), `dns-prefetch ${h}`);
  }
  const offenders = files
    .filter((f) => /stripe\.com|stripe\.network/.test(readFileSync(f, "utf8")) && /rel="(preconnect|dns-prefetch)"/.test(readFileSync(f, "utf8")))
    .map(rel)
    .sort();
  assert.deepEqual(offenders, [
    "app/(app)/app/billing/page.tsx",
    "app/(app)/app/checkout/page.tsx",
  ]);
});

test("checkout: Stripe.js is preloaded on intent (no Checkout Session is created early)", () => {
  const client = code("lib/stripe/client.ts");
  assert.match(client, /export function preloadStripe/);
  assert.doesNotMatch(client, /checkout\.sessions/);
  const card = code("components/billing/plan-card.tsx");
  assert.match(card, /router\.prefetch\(/);
  for (const ev of ["onPointerEnter", "onFocus", "onTouchStart"]) assert.match(card, new RegExp(ev));
  // the embedded form uses the SAME shared promise, so the preload is what it mounts
  assert.match(code("components/billing/embedded-checkout.tsx"), /getStripePromise\(\)/);
});

test("checkout: no serial customers.retrieve probe before the session; stale ids still heal", () => {
  const s = code("lib/stripe/checkout-session.ts");
  assert.doesNotMatch(s.replace(/\/\/.*$/gm, ""), /customers\.retrieve/);
  assert.match(s, /staleCustomer/);
  assert.match(s, /resource_missing/);
  // price, Adaptive Pricing, methods, return_url, metadata are untouched
  assert.match(s, /buildCheckoutSessionParams/);
  assert.match(s, /payment_method_types: \[\.\.\.CHECKOUT_PAYMENT_METHOD_TYPES\]/);
});

test("checkout: the form's space is reserved so nothing jumps when the iframe arrives (CLS)", () => {
  const f = code("components/billing/embedded-checkout.tsx");
  assert.equal((f.match(/min-h-\[760px\]/g) ?? []).length, 2);
});

test("auth: the user is verified once per request and shared by layout + pages", () => {
  const server = code("lib/supabase/server.ts");
  assert.match(server, /export const getUserResult = cache\(/);
  assert.match(server, /export const createSupabaseServerClient = cache\(/);
  assert.match(code("app/(app)/layout.tsx"), /getUserResult\(\)/);
  // still a server-side verification (getUser), never a cookie decode
  assert.match(server, /supabase\.auth\.getUser\(\)/);
  const stillRaw = files
    .filter((f) => rel(f).startsWith("app/(app)/") && /(page|layout)\.tsx$/.test(f))
    .filter((f) => /supabase\.auth\.getUser\(\)/.test(readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(stillRaw, [], "use getUserResult() so a request verifies the user once");
});

test("phones: big blurs and backdrop-filter are switched off in CSS, desktop untouched", () => {
  const css = code("app/globals.css");
  const block = css.slice(css.indexOf("Phone performance"));
  assert.match(block, /@media \(max-width: 767px\)/);
  assert.match(block, /\.blur-3xl,\s*\n\s*\.blur-2xl\s*\{\s*\n\s*filter: none;/);
  assert.match(block, /\[class\*="backdrop-blur"\]/);
  assert.match(block, /backdrop-filter: none/);
  assert.match(block, /animate-aurora-drift/);
});

test("the teaser video does not preload and does not autoplay", () => {
  const v = code("components/marketing/analyzer-teaser-video.tsx");
  assert.match(v, /preload="none"/);
  assert.doesNotMatch(v, /autoPlay/);
  assert.match(v, /poster=/);
});

test("the analyzer pipeline and its progress screen are untouched by this PR", () => {
  // Guard against drive-by edits: these files must keep their identity markers.
  assert.match(code("components/analyzer/analyzing-state.tsx"), /import \{ motion \} from "framer-motion"/);
});

test("checkout: the recovery email scheduling runs after the response, not before the payment panel", () => {
  const s = code("lib/stripe/checkout-session.ts");
  assert.match(s, /import \{ after \} from "next\/server"/);
  assert.match(s, /after\(emitRecovery\)/);
  // …and the emit (inngest.send) lives inside that deferred function
  const deferred = s.slice(s.indexOf("const emitRecovery"), s.indexOf("after(emitRecovery)"));
  assert.match(deferred, /inngest\.send/);
  assert.match(deferred, /checkout_recovery/);
  // the secret is returned after scheduling, never gated on the emit
  assert.ok(s.indexOf("after(emitRecovery)") < s.indexOf("return { ok: true, clientSecret"));
});

test("@stripe/stripe-js is only imported through its `/pure` entry (the default entry loads Stripe.js on import)", () => {
  const offenders = files
    .filter((f) => /from\s+["']@stripe\/stripe-js["']/.test(readFileSync(f, "utf8").replace(/import type[^;]*;/g, "")))
    .map(rel);
  assert.deepEqual(offenders, [], "import { loadStripe } from \"@stripe/stripe-js/pure\" so pages without a checkout never download Stripe");
  assert.match(code("lib/stripe/client.ts"), /@stripe\/stripe-js\/pure/);
});

test("checkout: Stripe.js is preloaded in <head>, at the exact URL @stripe/stripe-js will inject", () => {
  const train = readFileSync(join(root, "node_modules/@stripe/stripe-js/dist/index.mjs"), "utf8").match(/RELEASE_TRAIN = '(\w+)'/);
  assert.ok(train, "could not read RELEASE_TRAIN from @stripe/stripe-js");
  const page = code("app/(app)/app/checkout/page.tsx");
  assert.ok(
    page.includes(`rel="preload" as="script" href="https://js.stripe.com/${train![1]}/stripe.js"`),
    `the preload must point at https://js.stripe.com/${train![1]}/stripe.js — update it with the package`,
  );
});
