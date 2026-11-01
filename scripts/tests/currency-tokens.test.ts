import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveMoneyTokens } from "../../lib/currency/tokens";
import { translator } from "../../lib/i18n/messages";

const mxn = { code: "MXN", rate: 18, locale: "en" as const };
const ars = { code: "ARS", rate: 1000, locale: "en" as const };
const usd = { code: "USD", rate: 1, locale: "en" as const };

test("USD / no context: tokens render exactly the text we had before", () => {
  for (const ctx of [null, usd]) {
    assert.equal(resolveMoneyTokens("Pro {price:19}/mo", ctx), "Pro $19/mo");
    assert.equal(resolveMoneyTokens("Unlock for {uprice:7}", ctx), "Unlock for US$7");
    assert.equal(resolveMoneyTokens("{est:2000|$2,000} invoice", ctx), "$2,000 invoice");
    assert.equal(resolveMoneyTokens("{estr:1500:2000|$1.5k–2k} per audit", ctx), "$1.5k–2k per audit");
    assert.equal(resolveMoneyTokens("sin la factura de {est:2000|2.000 $}", ctx), "sin la factura de 2.000 $");
  }
});

test("Adaptive-supported currency: plan tokens become ≈ local (buffered, rounded up)", () => {
  assert.equal(resolveMoneyTokens("Pro {price:19}/mo", mxn), "Pro ≈ MX$360/mo");
  assert.equal(resolveMoneyTokens("Unlock for {uprice:7}", mxn), "Unlock for ≈ MX$140");
});

test("currency outside Adaptive Pricing keeps USD for plan prices", () => {
  assert.equal(resolveMoneyTokens("Pro {price:19}/mo", ars), "Pro US$19/mo"); // never a bare $ for an Argentine visitor
  assert.equal(resolveMoneyTokens("Unlock for {uprice:7}", ars), "Unlock for US$7");
});

test("comparison figures convert as compact ≈ in any currency with a rate", () => {
  assert.equal(resolveMoneyTokens("{est:2000|$2,000} invoice", mxn), "≈ MX$36K invoice");
  assert.equal(resolveMoneyTokens("{estr:1500:2000|$1.5k–2k} per audit", mxn), "≈ MX$27K–MX$36K per audit");
  assert.match(resolveMoneyTokens("{est:2000|$2,000}", ars), /^≈ ARS\s2M$/);
});

test("unusable rate behaves as USD; text without tokens is untouched", () => {
  assert.equal(resolveMoneyTokens("Pro {price:19}/mo", { ...mxn, rate: NaN }), "Pro $19/mo");
  assert.equal(resolveMoneyTokens("Hi {who}, 100% free", mxn), "Hi {who}, 100% free");
});

test("translator() without a currency never leaks a raw token (USD copy)", () => {
  for (const locale of ["en", "es"] as const) {
    const t = translator(locale);
    for (const key of [
      "analyzerPaywall.aCtaPro", "analyzerPaywall.aCtaScale", "comparison.cellPriceEv",
      "comparison.cellPriceAgency", "unlock.cardPrice", "unlock.cardCta", "unlock.proNote",
    ]) {
      const v = t(key);
      assert.doesNotMatch(v, /\{(price|uprice|est|estr):/, `${locale} ${key}: ${v}`);
    }
  }
  assert.equal(translator("en")("unlock.cardPrice"), "US$7 · one-time · no subscription");
  assert.equal(translator("en")("unlock.cardCta"), "Unlock for US$7");
});

test("translator() with a currency localises the same keys", () => {
  const t = translator("en", { code: "MXN", rate: 18 });
  assert.equal(t("unlock.cardCta"), "Unlock for ≈ MX$140");
});

test("no raw money token survives in any dictionary string once resolved (EN/ES)", () => {
  const dir = join(import.meta.dirname, "..", "..", "lib", "i18n", "dict");
  for (const f of ["ui-en.json", "ui-es.json"]) {
    const raw = readFileSync(join(dir, f), "utf8");
    for (const m of raw.matchAll(/\{(price|uprice|est|estr):[^}]*\}/g)) {
      const out = resolveMoneyTokens(m[0], null);
      assert.doesNotMatch(out, /\{(price|uprice|est|estr):/, `${f}: ${m[0]}`);
    }
  }
});

test("EN and ES carry the same money tokens (parity)", () => {
  const dir = join(import.meta.dirname, "..", "..", "lib", "i18n", "dict");
  const toks = (f: string) =>
    [...readFileSync(join(dir, f), "utf8").matchAll(/\{(price|uprice):[0-9.]+\}/g)].map((m) => m[0]).sort();
  const en = toks("ui-en.json");
  const es = toks("ui-es.json");
  // ES may omit keys that fall back to EN, but never add tokens EN doesn't have.
  for (const tok of es) assert.ok(en.includes(tok), tok);
});
