import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyForCountry } from "../../lib/currency/country-currency";
import { parseCurrencyCode } from "../../lib/currency/config";
import { isAdaptiveSupported } from "../../lib/currency/adaptive-supported";

test("dollarized countries stay in USD", () => {
  for (const c of ["US", "EC", "SV", "PA", "PR", "TL", "FM", "MH", "PW", "ZW", "BQ", "VG", "TC"]) {
    assert.equal(currencyForCountry(c), "USD", c);
  }
});

test("main markets map to their currency", () => {
  assert.equal(currencyForCountry("MX"), "MXN");
  assert.equal(currencyForCountry("CO"), "COP");
  assert.equal(currencyForCountry("ES"), "EUR");
  assert.equal(currencyForCountry("DE"), "EUR");
  assert.equal(currencyForCountry("BR"), "BRL");
  assert.equal(currencyForCountry("CL"), "CLP");
  assert.equal(currencyForCountry("GB"), "GBP");
  assert.equal(currencyForCountry("CA"), "CAD");
});

test("country code is trimmed and case-insensitive", () => {
  assert.equal(currencyForCountry(" mx "), "MXN");
});

test("unknown, empty or missing country → USD", () => {
  for (const c of ["ZZ", "XX", "", "  ", null, undefined]) assert.equal(currencyForCountry(c), "USD");
});

test("parseCurrencyCode accepts only 3 letters, upper-cased", () => {
  assert.equal(parseCurrencyCode("mxn"), "MXN");
  assert.equal(parseCurrencyCode("MXNN"), null);
  assert.equal(parseCurrencyCode("12$"), null);
  assert.equal(parseCurrencyCode(null), null);
});

test("Adaptive Pricing allowlist: MXN/COP/EUR/BRL yes; ARS/NGN no", () => {
  for (const c of ["USD", "MXN", "COP", "EUR", "BRL"]) assert.equal(isAdaptiveSupported(c), true, c);
  for (const c of ["ARS", "NGN", "VES", "EGP"]) assert.equal(isAdaptiveSupported(c), false, c);
});
