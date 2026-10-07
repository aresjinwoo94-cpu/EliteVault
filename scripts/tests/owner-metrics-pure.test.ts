import { test } from "node:test";
import assert from "node:assert/strict";
import { rangeBounds, startOfDay, bucketIndex, bucketLabel, guayaquilDay } from "../../lib/admin/time";
import { revenueFromBalanceTransactions, abandonedAmountUsd, isValidSubStatus } from "../../lib/admin/money";
import { countryLabel, flagEmoji } from "../../lib/admin/geo";

/* ── time zone: America/Guayaquil (UTC-5, no DST) ─────────────────────── */

test("startOfDay is Guayaquil midnight, not the server's (UTC) midnight (falla 7)", () => {
  // 2026-10-08 03:00Z = Oct 7 22:00 in Guayaquil → day started Oct 7 05:00Z
  assert.equal(new Date(startOfDay(Date.parse("2026-10-08T03:00:00Z"))).toISOString(), "2026-10-07T05:00:00.000Z");
  // 2026-10-07 04:00Z = Oct 6 23:00 local → still Oct 6
  assert.equal(new Date(startOfDay(Date.parse("2026-10-07T04:00:00Z"))).toISOString(), "2026-10-06T05:00:00.000Z");
  // exactly local midnight
  assert.equal(new Date(startOfDay(Date.parse("2026-10-07T05:00:00Z"))).toISOString(), "2026-10-07T05:00:00.000Z");
});

test("'today' starts at 00:00 Guayaquil with 24 hourly buckets", () => {
  const now = Date.parse("2026-10-08T03:00:00Z");
  const b = rangeBounds("today", now);
  assert.equal(new Date(b.gte).toISOString(), "2026-10-07T05:00:00.000Z");
  assert.equal(b.points, 24);
  assert.equal(b.unit, "h");
  assert.equal(new Date(b.prevGte).toISOString(), "2026-10-06T05:00:00.000Z");
  assert.equal(b.prevLte, b.gte);
});

test("7d = today + 6 previous local days; buckets land on local days", () => {
  const now = Date.parse("2026-10-08T03:00:00Z"); // Oct 7 22:00 local
  const b = rangeBounds("7d", now);
  assert.equal(new Date(b.gte).toISOString(), "2026-10-01T05:00:00.000Z");
  assert.equal(b.points, 7);
  // 22:00 local on Oct 7 → last bucket (labelled "Hoy")
  assert.equal(bucketIndex(now, b), 6);
  assert.equal(bucketLabel(6, b), "Hoy");
  assert.equal(bucketLabel(0, b), "-6d");
  // 23:30 local on Oct 6 (= Oct 7 04:30Z) belongs to the Oct 6 bucket, not Oct 7
  assert.equal(bucketIndex(Date.parse("2026-10-07T04:30:00Z"), b), 5);
});

test("hourly labels use the local hour", () => {
  const b = rangeBounds("today", Date.parse("2026-10-08T03:00:00Z"));
  assert.equal(bucketLabel(0, b), "00:00");
  assert.equal(bucketIndex(Date.parse("2026-10-07T17:30:00Z"), b), 12); // 12:30 local
});

test("guayaquilDay formats a local calendar day", () => {
  assert.equal(guayaquilDay(Date.parse("2026-10-07T04:00:00Z")), "2026-10-06");
});

/* ── money: always USD from the balance transaction (falla 3) ─────────── */

const bt = (o: Partial<{ type: string; amount: number; currency: string; created: number; customer: string | null }>) => ({
  type: "charge", amount: 0, currency: "usd", created: 1_790_000_000, customer: null, ...o,
});

test("a MXN purchase counts its USD settlement, not the peso figure", () => {
  // buyer paid 10,000 MXN → settled as 549 cents USD
  const r = revenueFromBalanceTransactions([bt({ amount: 549, currency: "usd", customer: "cus_mx" })], () => 0, 1);
  assert.equal(r.total, 5.49);
  assert.deepEqual(r.buckets, [5.49]);
  assert.equal(r.byCustomer.cus_mx, 5.49);
});

test("only charge/payment types count; refunds, fees and payouts are ignored", () => {
  const r = revenueFromBalanceTransactions(
    [bt({ type: "charge", amount: 2900 }), bt({ type: "payment", amount: 1000 }), bt({ type: "refund", amount: -2900 }),
     bt({ type: "stripe_fee", amount: -100 }), bt({ type: "payout", amount: -5000 })],
    () => 0, 1);
  assert.equal(r.total, 39);
});

test("non-USD settlement currency is skipped and reported, never summed as USD", () => {
  const r = revenueFromBalanceTransactions([bt({ amount: 99999, currency: "mxn" }), bt({ amount: 1000 })], () => 0, 1);
  assert.equal(r.total, 10);
  assert.equal(r.nonUsd, 1);
});

test("buckets use the supplied bucket function", () => {
  const r = revenueFromBalanceTransactions(
    [bt({ amount: 100, created: 1 }), bt({ amount: 200, created: 2 })], (ms) => (ms === 1000 ? 0 : 2), 3);
  assert.deepEqual(r.buckets, [1, 0, 2]);
});

test("abandoned checkout amount: USD from currency_conversion, else USD total, else plan list price", () => {
  assert.equal(abandonedAmountUsd({ currency: "mxn", amount_total: 50000, currency_conversion: { amount_total: 2900, source_currency: "usd" } }, 29), 29);
  assert.equal(abandonedAmountUsd({ currency: "usd", amount_total: 2900, currency_conversion: null }, 29), 29);
  assert.equal(abandonedAmountUsd({ currency: "cop", amount_total: 9000000, currency_conversion: null }, 29), 29);
});

test("only live-ish subscription statuses count as new subscriptions (falla 10)", () => {
  for (const s of ["active", "trialing", "past_due"]) assert.equal(isValidSubStatus(s), true, s);
  for (const s of ["incomplete", "incomplete_expired", "canceled", "unpaid"]) assert.equal(isValidSubStatus(s), false, s);
});

/* ── geo: every country, flag + Spanish name ──────────────────────────── */

test("Ecuador and any country get a flag and a Spanish name (falla 15)", () => {
  assert.equal(countryLabel("EC"), "🇪🇨 Ecuador");
  assert.equal(countryLabel("ec"), "🇪🇨 Ecuador");
  assert.equal(countryLabel("US"), "🇺🇸 Estados Unidos");
  assert.equal(countryLabel("JP"), "🇯🇵 Japón");
  assert.equal(countryLabel(null), "🌐 Desconocido");
  assert.equal(countryLabel(""), "🌐 Desconocido");
  assert.equal(flagEmoji("MX"), "🇲🇽");
});
