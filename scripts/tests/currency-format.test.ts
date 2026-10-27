import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTIVE_PRICING_BUFFER,
  formatMoney,
  formatPlanPrice,
  planPriceLocal,
  planShowsLocal,
} from "../../lib/currency/format";
import { formatPrice } from "../../lib/i18n/format";
import { formatCurrency } from "../../lib/utils";

const usd = { code: "USD", rate: 1, locale: "en" as const };
const mxn = { code: "MXN", rate: 18, locale: "en" as const };
const mxnEs = { ...mxn, locale: "es" as const };
const cop = { code: "COP", rate: 4000, locale: "en" as const };
const eur = { code: "EUR", rate: 0.86, locale: "en" as const };

test("USD (en) is identical to the current formatters, never ≈", () => {
  for (const n of [0, 7, 19, 29, 1500, 80000]) {
    assert.equal(formatMoney(n, usd), formatCurrency(n));
    assert.equal(formatMoney(n, usd), formatPrice(n, "en"));
    assert.equal(formatMoney(n, usd, { approx: true }), formatCurrency(n));
    assert.equal(formatPlanPrice(n, usd), formatCurrency(n));
  }
  assert.equal(formatMoney(19, usd), "$19");
});

test("USD ignores a stray rate (never converts)", () => {
  assert.equal(formatMoney(19, { code: "USD", rate: 99, locale: "en" }), "$19");
});

test("USD in Spanish keeps the bare $ the hardcoded ES copy uses", () => {
  assert.equal(formatMoney(19, { ...usd, locale: "es" }), "$19");
});

test("non-USD symbols are never a bare $", () => {
  const cad = { code: "CAD", rate: 1.4, locale: "en" as const };
  const clpEs = { code: "CLP", rate: 950, locale: "es" as const };
  for (const c of [mxn, mxnEs, cop, eur, cad, clpEs]) {
    const s = formatMoney(100, c);
    assert.ok(!/^\s*\$/.test(s), `${c.code}: ${s}`);
  }
  assert.equal(formatMoney(19, mxn), "MX$342");
  assert.equal(formatMoney(19, cad), "CA$27");
  assert.match(formatMoney(19, mxnEs), /MXN/);
  assert.match(formatMoney(19, cop), /^COP/);
});

test("decimals: price/metric 0; small 2, but 0 for zero-decimal / low-unit currencies", () => {
  assert.equal(formatMoney(1.234, usd, { kind: "small" }), "$1.23");
  assert.equal(formatMoney(1.234, usd, { kind: "metric" }), "$1");
  assert.equal(formatMoney(1.234, mxn, { kind: "small" }), "MX$22.21");
  for (const code of ["JPY", "KRW", "CLP", "COP", "ARS", "PYG", "VND", "IDR", "HUF"]) {
    const s = formatMoney(1.5, { code, rate: 1000, locale: "en" }, { kind: "small" });
    assert.ok(!/\.\d/.test(s), `${code}: ${s}`);
  }
});

test("compact abbreviates big amounts in both languages", () => {
  assert.equal(formatMoney(80000, mxn, { compact: true }), "MX$1.4M");
  assert.match(formatMoney(80000, mxnEs, { compact: true }), /MXN\s?1[.,]4\s?M/);
  assert.equal(formatMoney(80000, usd, { compact: true }), "$80K");
});

test("≈ only when converted and asked for", () => {
  assert.equal(formatMoney(19, mxn, { approx: true }), "≈ MX$342");
  assert.equal(formatMoney(19, mxn), "MX$342");
  assert.equal(formatMoney(19, usd, { approx: true }), "$19");
});

test("plan price: market rate + 4% buffer, rounded UP to a clean figure", () => {
  assert.equal(ADAPTIVE_PRICING_BUFFER, 0.04);
  assert.equal(planPriceLocal(19, mxn), 360); // 355.68 → step 10
  assert.equal(planPriceLocal(19, cop), 80000); // 79,040 → step 1000
  assert.equal(planPriceLocal(19, eur), 17); // 16.99 → step 1
  assert.equal(planPriceLocal(7, eur), 7); // 6.26 → 7
  assert.equal(planPriceLocal(19, usd), 19);
  for (const c of [mxn, cop, eur]) {
    assert.ok(planPriceLocal(19, c) >= 19 * c.rate * 1.04 - 1e-6, c.code); // never below
  }
  assert.equal(formatPlanPrice(19, mxn), "MX$360");
  assert.equal(formatPlanPrice(19, mxn, { approx: true }), "≈ MX$360");
});

test("plans show local only for Adaptive-supported currencies", () => {
  assert.equal(planShowsLocal({ code: "MXN" }), true);
  assert.equal(planShowsLocal({ code: "ARS" }), false);
  assert.equal(planShowsLocal({ code: "USD" }), false);
});
