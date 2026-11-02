import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simulateAll } from "../../lib/meta/simulation-engine";
import { formatMoney } from "../../lib/currency/format";
import {
  SIM_AOV_MAX_USD,
  SIM_BUDGET_MAX_USD,
  SIM_USD,
  isUsableRate,
  localToUsd,
  simDisplayFromRow,
  usdToLocal,
} from "../../lib/currency/sim";
import { SIM_COLUMNS, SIM_COLUMNS_WITH_DISPLAY, withDisplayColumns } from "../../lib/meta/sim-columns";

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("engine: same USD inputs give the same result as main, byte for byte (the engine file is untouched)", () => {
  const inputs = [
    { niche: "skincare", score: 62, aovUsd: 53.19, dailyBudgetUsd: 26.6, marginPct: 55, country: "LATAM", productType: "physical", competitiveness: "medium", month: 10 },
    { niche: "apparel", score: 40, aovUsd: 120, dailyBudgetUsd: 200, marginPct: null, country: "US", productType: "physical", competitiveness: "high", month: 2 },
    { niche: "", score: 85, aovUsd: 9, dailyBudgetUsd: 5, marginPct: 80, country: "EU-W", productType: "digital", competitiveness: "low", month: 6 },
  ];
  const out = inputs.map((i) => simulateAll(i as never));
  const digest = createHash("sha256").update(JSON.stringify(out)).digest("hex");
  assert.equal(digest, "173c37ea41ca1d09313b7a4eeb8148b7d465c23183a2d32ae2ec42be0c2a0e5d");
});

test("round trip local → USD → local stays within a cent of the converted value", () => {
  for (const rate of [0.86, 1.4, 18.7, 105, 950, 4100, 16000]) {
    for (const local of [1, 9.99, 50, 349, 1200, 25000, 987654]) {
      const usd = localToUsd(local, rate);
      assert.ok(Math.abs(usd * 100 - Math.round(usd * 100)) < 1e-6, `cents ${usd}`);
      // back to local: error bounded by half a cent of USD converted
      assert.ok(Math.abs(usdToLocal(usd, rate) - local) <= 0.005 * rate + 1e-9, `${local} @ ${rate}`);
    }
  }
});

test("USD (rate 1) is the identity; unusable rates never convert", () => {
  assert.equal(localToUsd(49.5, 1), 49.5);
  for (const bad of [0, -1, NaN, Infinity, "18" as unknown as number]) {
    assert.equal(isUsableRate(bad), false);
    assert.equal(localToUsd(100, bad as number), 100);
    assert.equal(usdToLocal(100, bad as number), 100);
  }
});

test("rows without display_currency (from before the migration) are shown in USD, exactly as today", () => {
  assert.deepEqual(simDisplayFromRow(null), SIM_USD);
  assert.deepEqual(simDisplayFromRow(undefined), SIM_USD);
  assert.deepEqual(simDisplayFromRow({}), SIM_USD);
  assert.deepEqual(simDisplayFromRow({ display_currency: null, display_fx_rate: null }), SIM_USD);
  assert.deepEqual(simDisplayFromRow({ display_currency: "MXN", display_fx_rate: null }), SIM_USD);
  assert.deepEqual(simDisplayFromRow({ display_currency: "mx", display_fx_rate: 18 }), SIM_USD);
  assert.deepEqual(simDisplayFromRow({ display_currency: "USD", display_fx_rate: 5 }), SIM_USD);
  assert.deepEqual(simDisplayFromRow({ display_currency: "MXN", display_fx_rate: 0 }), SIM_USD);
  assert.deepEqual(simDisplayFromRow({ display_currency: "MXN", display_fx_rate: "18.5" }), { code: "MXN", rate: 18.5 });
});

test("USD display equals the old $-formatting for whole dollars and plain cents", () => {
  const usd = { code: "USD", rate: 1, locale: "en" as const };
  const oldFmt = (n: number, max = 0) => `$${n.toLocaleString("en-US", { maximumFractionDigits: max })}`;
  for (const n of [0, 7, 112, 385, 945, 1234, 56789]) {
    assert.equal(formatMoney(n, usd, { kind: "metric" }), oldFmt(n));
  }
  // CPA / CPC / CPM: two decimals. Old code printed "$12.5" for 12.5; the brief asks for 2 decimals ("$12.50").
  for (const n of [1.4, 22.5, 12.34, 0.35]) {
    assert.equal(formatMoney(n, usd, { kind: "small" }), `$${n.toFixed(2)}`);
  }
  for (const n of [12.34, 1.23]) assert.equal(formatMoney(n, usd, { kind: "small" }), oldFmt(n, 2));
});

test("local display of the same engine numbers: MXN / COP / EUR", () => {
  const mxn = { code: "MXN", rate: 18, locale: "en" as const };
  assert.equal(formatMoney(385, mxn, { kind: "metric" }), "MX$6,930");
  assert.equal(formatMoney(1.4, mxn, { kind: "small" }), "MX$25.20");
  const cop = { code: "COP", rate: 4000, locale: "en" as const };
  assert.equal(formatMoney(1.4, cop, { kind: "small" }).replace(/ /g, " "), "COP 5,600"); // no cents for COP
});

test("the display columns are optional and withDisplayColumns degrades when the migration is missing", async () => {
  assert.ok(SIM_COLUMNS_WITH_DISPLAY.includes("display_currency") && !SIM_COLUMNS.includes("display_currency"));
  assert.ok(!SIM_COLUMNS_WITH_DISPLAY.includes("user_id") && !SIM_COLUMNS_WITH_DISPLAY.includes("inngest_run_id"));
  const seen: string[] = [];
  const missing = await withDisplayColumns(async (cols) => {
    seen.push(cols);
    return cols.includes("display_currency")
      ? { data: null, error: { message: 'column "display_currency" does not exist' } }
      : { data: { id: "x" }, error: null };
  });
  assert.deepEqual(seen, [SIM_COLUMNS_WITH_DISPLAY, SIM_COLUMNS]);
  assert.equal((missing as { data: { id: string } }).data.id, "x");
  const ok = await withDisplayColumns(async () => ({ data: { id: "y" }, error: null }));
  assert.equal((ok as { data: { id: string } }).data.id, "y");
  // unrelated errors are NOT retried
  let calls = 0;
  await withDisplayColumns(async () => {
    calls++;
    return { data: null, error: { message: "permission denied" } };
  });
  assert.equal(calls, 1);
});

test("wiring: every read path uses the tolerant select; the action pins display only for non-USD", () => {
  for (const f of ["app/api/meta-simulations/[id]/route.ts", "app/(app)/app/analyzer/[id]/page.tsx", "lib/share/full-report.ts"]) {
    assert.match(read(f), /withDisplayColumns(<[^>]*>)?\(/, f);
    assert.doesNotMatch(read(f), /aov_usd, daily_budget_usd/, `${f} must not hardcode the column list`);
  }
  const action = read("app/actions/meta-simulator.ts");
  assert.match(action, /displayCurrency !== "USD"/);
  assert.match(action, /\.max\(10_000/);
  assert.match(action, /\.max\(50_000/);
  assert.equal(SIM_AOV_MAX_USD, 10_000);
  assert.equal(SIM_BUDGET_MAX_USD, 50_000);
});

test("the migration is additive, idempotent and has a rollback", () => {
  const up = read("supabase/migrations/0048_meta_simulations_display_currency.sql");
  assert.match(up, /add column if not exists display_currency/);
  assert.match(up, /add column if not exists display_fx_rate/);
  assert.doesNotMatch(up, /drop |delete |truncate |not null/i);
  const down = read("supabase/rollbacks/0048_meta_simulations_display_currency_rollback.sql");
  assert.match(down, /drop column if exists display_currency/);
  assert.match(down, /drop column if exists display_fx_rate/);
});

test("no hardcoded $ left in the simulator/optimizer output components", () => {
  for (const f of [
    "components/analyzer/simulator-scenario-card.tsx",
    "components/analyzer/simulator-chart.tsx",
    "components/analyzer/meta-ads-optimizer.tsx",
    "components/analyzer/meta-campaign-simulator.tsx",
  ]) {
    const code = read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.doesNotMatch(code, /`\$\$\{|"\$[0-9]|\$\{[^}]*\}\/day|\$\$\{/, f);
    assert.doesNotMatch(code, /toLocaleString\("en-US"/, f);
  }
});

test("the AI agent and engine still work in USD only", () => {
  assert.match(read("ai/agents/meta-ads-optimizer-agent.ts"), /currency: z\.literal\("USD"\)/);
  const forbidden = /display_currency|display_fx_rate|useMoney|formatMoney|currency\/(format|sim|server)/;
  for (const f of ["lib/meta/simulation-engine.ts", "ai/agents/meta-ads-optimizer-agent.ts", "ai/agents/run-meta-simulation.ts", "inngest/functions/run-meta-simulation.ts"]) {
    assert.doesNotMatch(read(f), forbidden, f);
  }
});

test("ROAS / CTR / CVR / purchases are ratios and counts: no currency formatting touches them", () => {
  const card = read("components/analyzer/simulator-scenario-card.tsx");
  assert.match(card, /Math\.round\(totals\.purchases\)/);
  const opt = read("components/analyzer/meta-ads-optimizer.tsx");
  assert.match(opt, /tg\.roas\.toFixed\(1\)\}x/);
  assert.match(opt, /tg\.ctr \* 100\)\.toFixed\(2\)\}%/);
  assert.match(opt, /tg\.cvr \* 100\)\.toFixed\(2\)\}%/);
});
