// Regenerates lib/currency/fallback-rates.json — the committed snapshot
// getUsdRates() falls back to when the live source is slow or down.
//   node scripts/refresh-fallback-rates.mjs
import { writeFileSync } from "node:fs";

const SOURCE = "https://open.er-api.com/v6/latest/USD";
const res = await fetch(SOURCE, { signal: AbortSignal.timeout(10_000) });
if (!res.ok) throw new Error(`rates source answered ${res.status}`);
const body = await res.json();
if (body.result !== "success" || typeof body.rates !== "object") {
  throw new Error("unexpected rates payload");
}

const rates = {};
for (const [code, rate] of Object.entries(body.rates).sort(([a], [b]) => a.localeCompare(b))) {
  if (/^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0) rates[code] = rate;
}
rates.USD = 1;

const out = new URL("../lib/currency/fallback-rates.json", import.meta.url);
writeFileSync(out, JSON.stringify({ source: SOURCE, updated: new Date().toISOString().slice(0, 10), rates }, null, 2) + "\n");
console.log(`wrote ${Object.keys(rates).length} rates`);
