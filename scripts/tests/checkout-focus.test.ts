import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Brief §5 — the focused mobile checkout.
 *
 * On a phone the upgrade flow was: app topbar (with a menu full of exits) →
 * "You're upgrading to EliteVault Pro" → plan card → benefits → survey stats →
 * trust badges → and only then the payment form. The buyer had already
 * decided; they were scrolling past the pitch to reach the thing they clicked
 * for. These pins are all about ORDER and DUPLICATION, which is exactly what
 * a later well-meaning edit tends to undo.
 *
 * Desktop must keep the original two columns, so each phone-only rule is
 * pinned together with its `lg:` counterpart.
 */

const ROOT = process.cwd();
const code = (p: string) =>
  readFileSync(resolve(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("the payment panel comes first on a phone and second on desktop", () => {
  const layout = code("components/billing/checkout-layout.tsx");
  assert.match(layout, /className="order-2 space-y-6 lg:order-1"/, "summary column");
  assert.match(layout, /className="order-1 lg:order-2"/, "payment column");
  assert.match(layout, /grid lg:grid-cols-\[5fr_7fr\]/, "desktop keeps its two columns");
});

test("the plan header and price are not repeated on a phone", () => {
  const layout = code("components/billing/checkout-layout.tsx");
  // Desktop header + pricing card: desktop only.
  assert.match(layout, /className="hidden lg:block"[\s\S]{0,200}You&apos;re upgrading to/);
  assert.match(layout, /hidden overflow-hidden rounded-2xl[^"]*lg:block/, "pricing card is desktop-only");
  // Phone replacement: one compact line, phone only.
  assert.match(layout, /lg:hidden[\s\S]{0,400}You&apos;re upgrading to/);
  // Exactly two "upgrading to" blocks total (one per breakpoint), never both.
  assert.equal((layout.match(/You&apos;re upgrading to/g) ?? []).length, 2);
  // And the "Payment" label doesn't stack on top of the compact line.
  assert.match(layout, /hidden text-\[11px\][^"]*lg:block"\s*>\s*\n\s*Payment/);
});

test("the app chrome is hidden on the payment route, phones only", () => {
  const chrome = code("components/dashboard/focus-chrome.tsx");
  assert.match(chrome, /const focused = pathname === "\/app\/checkout"/);
  // `md:contents` (not `md:block`) so the topbar keeps its own sticky
  // positioning against the layout's flex column at md and up.
  assert.match(chrome, /focused \? "hidden md:contents" : "contents"/);
  const layout = code("app/(app)/layout.tsx");
  assert.match(layout, /<HideChromeOnCheckout>\s*\n\s*<AppTopbar/, "the topbar is the wrapped chrome");
  // The sidebar is already hidden below md, so it must NOT be wrapped (that
  // would hide it on desktop too).
  assert.doesNotMatch(layout, /<HideChromeOnCheckout>[\s\S]*<AppSidebar/);
});

test("the payment route always keeps a way back", () => {
  const layout = code("components/billing/checkout-layout.tsx");
  // The header holding the back link must not be hidden at any breakpoint —
  // with the app chrome gone on phones it is the only way out.
  const header = layout.match(/<header[^>]*className="([^"]*)"/);
  assert.ok(header, "checkout header");
  assert.doesNotMatch(header![1], /\bhidden\b/, "the checkout header is never hidden");
  assert.match(layout, /href="\/app\/billing"/);

  // And the chrome only goes away on the payment page itself: the return
  // page's "activating your plan" state has no navigation of its own.
  const chrome = code("components/dashboard/focus-chrome.tsx");
  assert.match(chrome, /pathname === "\/app\/checkout"/);
  assert.doesNotMatch(chrome, /startsWith\("\/app\/checkout"\)/);
});

// The markup was extracted out of the page; these are the pieces that would
// vanish silently if a later edit dropped them.
test("the extraction kept everything the page used to render", () => {
  const layout = code("components/billing/checkout-layout.tsx");
  for (const piece of ["<ResultsBars", "<PaymentMethods", "<CheckoutReviews", "What you get"]) {
    assert.ok(layout.includes(piece), `missing ${piece}`);
  }
  const page = code("app/(app)/app/checkout/page.tsx");
  // The Stripe preconnects stayed on the page (they must still render), and
  // the session promise is still handed over un-awaited.
  for (const host of ["js.stripe.com", "api.stripe.com", "checkout.stripe.com", "m.stripe.network"]) {
    assert.ok(page.includes(`https://${host}`), `missing preconnect ${host}`);
  }
  assert.match(page, /const sessionPromise = createEmbeddedCheckoutSession\(/);
  assert.doesNotMatch(page, /await createEmbeddedCheckoutSession/, "must stay un-awaited");
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /metadata = \{ title: "Checkout" \}/);
});

test("the embedded form is themed dark through the Stripe session", () => {
  const session = code("lib/stripe/checkout-session.ts");
  // Our CSS cannot cross into Stripe's iframe; branding_settings is the only
  // way, and it is per session so Dashboard branding (invoices, emails) is
  // left alone.
  assert.match(session, /branding_settings:\s*\{/);
  assert.match(session, /background_color:\s*"#0A0A0F"/);
  assert.match(session, /button_color:\s*"#2DD4BF"/);
  // Keep the Dashboard's brand name and logo: omitted fields inherit them.
  assert.doesNotMatch(session, /branding_settings[\s\S]{0,300}display_name/);
});

test("a rejected branding parameter must never cost the sale", () => {
  const session = code("lib/stripe/checkout-session.ts");
  // Retry once without the theme rather than showing an error box where the
  // payment form should be.
  assert.match(session, /if \(!isBrandingRejection\(err\)\) throw err;/);
  assert.match(session, /delete \(withoutBranding as Record<string, unknown>\)\.branding_settings/);
  assert.match(session, /sessions\.create\(withoutBranding\)/);
  // The detector must not swallow real payment errors (card, price, customer).
  assert.match(session, /e\?\.param\?\.startsWith\("branding_settings"\)/);
  assert.match(session, /branding_settings\/i\.test/);
});
