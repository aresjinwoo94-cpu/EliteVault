import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { CHECKOUT_PAYMENT_METHOD_TYPES } from "../../lib/stripe/payment-method-types";
import {
  ACCEPTED_PAYMENT_MARKS,
  MARKS_BY_PAYMENT_METHOD_TYPE,
  WORDMARKS,
} from "../../components/billing/payment-marks";
import { messages } from "../../lib/i18n/messages";

/**
 * WP-2 (docs/analyzer-mejora-definitiva.md §6.1/§7) — the "We accept" badge
 * rows in the checkout AND the marketing footer.
 *
 * The hard rule: a brand may only be shown if Stripe Checkout is actually
 * configured to offer it. Advertising a method we don't take breaks trust at
 * the worst possible moment. Before this, the rule lived in a comment ("keep
 * the two in sync"); now the badge rows DERIVE their brands from the same list
 * the Stripe session is created with, and these tests pin both ends of that.
 */

const ROOT = process.cwd();

/** Source without comments, so a commented-out line can't satisfy a check. */
function code(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(resolve(ROOT, dir))) {
    const full = join(resolve(ROOT, dir), name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(relative(ROOT, full)));
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name)) {
      out.push(relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

// ─── The Stripe end ─────────────────────────────────────────────────────────

test("the checkout's Stripe payment methods are pinned: card, amazon_pay, cashapp, link", () => {
  // Changing what checkout offers must be a deliberate edit that fails here
  // first, not a side effect.
  assert.deepEqual([...CHECKOUT_PAYMENT_METHOD_TYPES], ["card", "amazon_pay", "cashapp", "link"]);
});

test("the Stripe session is created with exactly the shared list, and nothing else sets it", () => {
  const session = code("lib/stripe/checkout-session.ts");
  // Quoted keys too: `"payment_method_types": [...]` is the same Stripe param.
  const values = [
    ...session.matchAll(/["']?payment_method_types["']?\s*:\s*([^,\n]+)/g),
  ].map((m) => m[1].trim());
  assert.deepEqual(
    values,
    ["[...CHECKOUT_PAYMENT_METHOD_TYPES]"],
    "checkout-session.ts must pass the shared constant, not its own literal",
  );

  // A second place creating sessions with its own list would reopen the drift.
  const others = ["app", "lib", "components", "inngest"]
    .flatMap(sourceFiles)
    .filter((f) => f !== "lib/stripe/checkout-session.ts")
    .filter((f) => /payment_method_types/.test(code(f)));
  assert.deepEqual(others, [], "only checkout-session.ts may set payment_method_types");
});

// ─── The badge end ──────────────────────────────────────────────────────────

test("HARD RULE: every advertised brand is backed by a method Stripe checkout offers", () => {
  // An independent truth table, written here on purpose. Checking the badges
  // against the module's own mapping would pass whatever that mapping says,
  // including a Klarna mark filed under "card".
  const STRIPE_METHOD_FOR_BRAND: Record<string, string> = {
    visa: "card",
    mastercard: "card",
    amex: "card",
    discover: "card",
    amazonpay: "amazon_pay",
    cashapp: "cashapp",
    link: "link",
  };
  const offered: readonly string[] = CHECKOUT_PAYMENT_METHOD_TYPES;
  for (const mark of ACCEPTED_PAYMENT_MARKS) {
    const method = STRIPE_METHOD_FOR_BRAND[mark];
    assert.ok(method, `"${mark}" is shown but isn't a brand of any Stripe method we use`);
    assert.ok(offered.includes(method), `"${mark}" needs "${method}", which checkout doesn't offer`);
  }
});

test("the row draws the DERIVED list, not a hand-kept one", () => {
  // No renderer is available under the test runner's react-server condition,
  // so pin the structure instead: the only list PaymentMarks iterates is
  // ACCEPTED_PAYMENT_MARKS, and the display order is used only to sort it.
  const marks = code("components/billing/payment-marks.tsx");
  assert.match(marks, /\{ACCEPTED_PAYMENT_MARKS\.map\(/);
  assert.equal((marks.match(/\.map\s*\(/g) ?? []).length, 1, "exactly one rendered list");
  // …and no chip drawn outside that loop: BrandMark is private and rendered once.
  assert.equal((marks.match(/<BrandMark\b/g) ?? []).length, 1, "BrandMark is rendered only by the loop");
  assert.doesNotMatch(marks, /export\s+(function|const)\s+BrandMark\b/, "BrandMark must not be exported");
  assert.equal((marks.match(/\bDISPLAY_ORDER\b/g) ?? []).length, 2, "declared + used to sort");
  assert.doesNotMatch(marks, /Object\.(keys|values|entries)\(\s*WORDMARKS/);
});

test("each enabled method maps to its brands (card → Visa / Mastercard / Amex / Discover)", () => {
  // No leftover entry for a method checkout no longer offers: removing a method
  // from the Stripe list must remove its brands everywhere, not just the key.
  assert.deepEqual(
    Object.keys(MARKS_BY_PAYMENT_METHOD_TYPE).sort(),
    [...CHECKOUT_PAYMENT_METHOD_TYPES].sort(),
  );
  assert.deepEqual(
    Object.fromEntries(
      CHECKOUT_PAYMENT_METHOD_TYPES.map((t) => [t, [...MARKS_BY_PAYMENT_METHOD_TYPE[t]]]),
    ),
    {
      card: ["visa", "mastercard", "amex", "discover"],
      amazon_pay: ["amazonpay"],
      cashapp: ["cashapp"],
      link: ["link"],
    },
  );
});

test("no brand exists that Stripe isn't configured for — no Klarna, Apple/Google Pay, PayPal, BLIK…", () => {
  // Apple Pay / Google Pay DO appear inside Stripe's own iframe when the
  // browser supports them, but they aren't a configured method we can promise
  // every visitor, so our chrome must not advertise them.
  const forbidden = /klarna|afterpay|affirm|blik|paypal|apple|google|gpay|ideal|sepa|bancontact/i;
  for (const [key, mark] of Object.entries(WORDMARKS)) {
    assert.doesNotMatch(`${key} ${mark.label} ${mark.word}`, forbidden, `wordmark "${key}"`);
  }
  // No orphan wordmark that could be rendered without an enabled method.
  const mapped = [...new Set(Object.values(MARKS_BY_PAYMENT_METHOD_TYPE).flat())].sort();
  assert.deepEqual(Object.keys(WORDMARKS).sort(), mapped);
});

test("the checkout keeps showing the same seven brands, in the same order", () => {
  assert.deepEqual(
    [...ACCEPTED_PAYMENT_MARKS],
    ["visa", "mastercard", "amex", "discover", "cashapp", "amazonpay", "link"],
  );
});

// ─── One SVG, reused ────────────────────────────────────────────────────────

test("the wordmark SVG is defined once and reused by the checkout AND the footer", () => {
  // Neither host may add a payment brand of its own next to the shared row: an
  // <img src="/klarna.svg">, or a hand-placed chip for a method checkout no
  // longer offers, would bypass every rule above.
  const paymentBrands =
    /visa|mastercard|amex|american express|discover|cash ?app|amazon ?pay|link by stripe|klarna|afterpay|affirm|blik|paypal|apple ?pay|google ?pay/i;
  const drawsMarks = /<text|WORDMARKS|BrandMark/;

  // The checkout row has no reason to render any other image.
  const checkout = code("components/billing/payment-methods.tsx");
  assert.match(checkout, /from\s+["']@\/components\/billing\/payment-marks["']/);
  assert.match(checkout, /<PaymentMarks\b/);
  assert.doesNotMatch(checkout, /<svg|<img\b|<Image\b/, "checkout must not draw its own marks");
  assert.doesNotMatch(checkout, drawsMarks, "checkout must not draw its own marks");
  assert.doesNotMatch(checkout, paymentBrands, "checkout must not name a brand itself");

  // The footer may grow unrelated icons (socials, badges), so it is held to
  // "no payment brand of its own" rather than "no images at all".
  const footer = code("components/marketing/footer.tsx");
  assert.match(footer, /from\s+["']@\/components\/billing\/payment-marks["']/);
  assert.match(footer, /<PaymentMarks\b/);
  assert.doesNotMatch(footer, drawsMarks, "footer must not draw its own marks");
  assert.doesNotMatch(footer, paymentBrands, "footer must not name a payment brand itself");

  const drawers = ["app", "components"]
    .flatMap(sourceFiles)
    .filter((f) => /lengthAdjust/.test(code(f)));
  assert.deepEqual(drawers, ["components/billing/payment-marks.tsx"]);
});

test("the shared marks are client-safe and asset-free (CSP-safe, no network)", () => {
  const marks = code("components/billing/payment-marks.tsx");
  assert.doesNotMatch(
    marks,
    /server-only|\bgetT\b|next\/headers|@\/lib\/stripe\/server|async\s+function/,
    "must be importable from the client footer",
  );
  assert.doesNotMatch(marks, /<img\b|\bsrc=|\bhref=|url\(|https?:/, "no external or linked asset");
  // One accessible name per chip. An SVG with both aria-label and <title>
  // exposes the title as a description, so screen readers say "Visa, graphic,
  // Visa" — seven times, on every marketing page.
  assert.match(marks, /role="img"/);
  assert.match(marks, /aria-label=\{m\.label\}/);
  assert.doesNotMatch(marks, /<title>/, "aria-label alone names the chip");

  const types = readFileSync(resolve(ROOT, "lib/stripe/payment-method-types.ts"), "utf8");
  assert.doesNotMatch(types, /^\s*import\s/m, "the shared list must not pull anything into the client bundle");

  assert.match(
    readFileSync(resolve(ROOT, "components/marketing/footer.tsx"), "utf8"),
    /^"use client";/,
    "the footer is still a client component",
  );
});

test("the footer label exists in both locales and is the one rendered", () => {
  const en = (messages.en as Record<string, Record<string, unknown>>).footer;
  const es = (messages.es as Record<string, Record<string, unknown>>).footer;
  assert.equal(en.weAccept, "We accept");
  assert.equal(es.weAccept, "Aceptamos");
  assert.match(code("components/marketing/footer.tsx"), /t\(\s*["']footer\.weAccept["']\s*\)/);
});

// §6.1 follow-up — the footer row shipped but was effectively invisible: 11px
// wordmarks at 45% white on a near-transparent chip. It must stay readable.
test("the footer's We accept row is sized and contrasted to be read", () => {
  const footer = code("components/marketing/footer.tsx");
  assert.match(footer, /<PaymentMarks[\s\S]*?size="md"/, "footer uses the larger chip size");
  const chipText = footer.match(/chipClassName="[^"]*text-white\/(\d+)/);
  assert.ok(chipText, "footer sets the chip text colour");
  assert.ok(Number(chipText![1]) >= 70, `chip text white/${chipText![1]} is too faint`);
  const label = footer.match(/id=\{weAcceptId\}\s*className="[^"]*text-white\/(\d+)/);
  assert.ok(label, "the label has an explicit colour");
  assert.ok(Number(label![1]) >= 50, `label white/${label![1]} is too faint`);

  const marks = code("components/billing/payment-marks.tsx");
  const md = marks.match(/md:\s*\{\s*mark:\s*(\d+)/);
  assert.ok(md && Number(md[1]) >= 14, "md wordmarks are at least 14px tall");
  // The checkout keeps its current size (default sm = 11px).
  assert.match(marks, /sm:\s*\{\s*mark:\s*11\b/);
  assert.match(marks, /size\s*=\s*"sm"/);
});
