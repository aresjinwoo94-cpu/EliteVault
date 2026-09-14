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
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(relative(ROOT, full).replace(/\\/g, "/"));
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
  const values = [...session.matchAll(/payment_method_types\s*:\s*([^,\n]+)/g)].map((m) =>
    m[1].trim(),
  );
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
  for (const mark of ACCEPTED_PAYMENT_MARKS) {
    const backedBy = CHECKOUT_PAYMENT_METHOD_TYPES.filter((t) =>
      MARKS_BY_PAYMENT_METHOD_TYPE[t].includes(mark),
    );
    assert.ok(backedBy.length > 0, `"${mark}" is shown but no enabled Stripe method offers it`);
  }
});

test("each enabled method maps to its brands (card → Visa / Mastercard / Amex / Discover)", () => {
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
  const checkout = code("components/billing/payment-methods.tsx");
  assert.match(checkout, /from\s+["']@\/components\/billing\/payment-marks["']/);
  assert.match(checkout, /<PaymentMarks\b/);
  assert.doesNotMatch(checkout, /<svg|<text|WORDMARKS/, "checkout must not draw its own marks");

  const footer = code("components/marketing/footer.tsx");
  assert.match(footer, /from\s+["']@\/components\/billing\/payment-marks["']/);
  assert.match(footer, /<PaymentMarks\b/);
  assert.doesNotMatch(footer, /<svg|<text|WORDMARKS/, "footer must not draw its own marks");

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
