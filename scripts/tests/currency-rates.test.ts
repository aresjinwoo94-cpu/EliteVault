import { test } from "node:test";
import assert from "node:assert/strict";
import { getUsdRates, sanitizeRates, fallbackRates } from "../../lib/currency/rates";

const ok = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("fallback snapshot covers the markets we map and USD is 1", () => {
  assert.equal(fallbackRates.USD, 1);
  for (const c of ["MXN", "COP", "EUR", "BRL", "CLP", "GBP"]) assert.ok(fallbackRates[c] > 0, c);
});

test("live rates win over the snapshot and USD stays 1", async () => {
  const r = await getUsdRates(ok({ result: "success", rates: { USD: 5, MXN: 99.5 } }));
  assert.equal(r.MXN, 99.5);
  assert.equal(r.USD, 1);
  assert.equal(r.COP, fallbackRates.COP); // not in live payload → snapshot
});

test("network error → snapshot, never throws", async () => {
  const r = await getUsdRates((async () => {
    throw new Error("down");
  }) as unknown as typeof fetch);
  assert.deepEqual(r, fallbackRates);
});

test("non-200, bad JSON shape or result!=success → snapshot", async () => {
  assert.deepEqual(await getUsdRates(ok({}, 500)), fallbackRates);
  assert.deepEqual(await getUsdRates(ok({ result: "error" })), fallbackRates);
  assert.deepEqual(await getUsdRates(ok({ result: "success", rates: "x" })), fallbackRates);
});

test("hung source is cut at ~1.5s and falls back", async () => {
  const hang = ((_u: unknown, init?: RequestInit) =>
    new Promise((_res, rej) =>
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))),
    )) as unknown as typeof fetch;
  const t0 = Date.now();
  const r = await getUsdRates(hang);
  const ms = Date.now() - t0;
  assert.deepEqual(r, fallbackRates);
  assert.ok(ms >= 1400 && ms < 2500, `took ${ms}ms`);
});

test("sanitizeRates drops junk entries", () => {
  assert.deepEqual(sanitizeRates({ MXN: 18, BAD: -1, XX: 2, EUR: "1" }), { MXN: 18 });
  assert.equal(sanitizeRates(null), null);
  assert.equal(sanitizeRates({}), null);
});
