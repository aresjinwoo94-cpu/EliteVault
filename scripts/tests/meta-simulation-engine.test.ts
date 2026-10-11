import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreRoasCeiling,
  simulateAll,
  type SimInputs,
  type SimulatorCompetitiveness,
  type SimulatorCountry,
  type SimulatorProductType,
} from "../../lib/meta/simulation-engine";
import { fallbackNarrative, sanitizeNarrative } from "../../lib/meta/scenario-narrative";

/**
 * Brief §4.2 invariants. They are PROPERTIES over a grid of inputs, not a few
 * hand-picked cases: the point is that no combination a user can type breaks
 * the ordering, the arithmetic or the ceilings.
 */

const NICHES = ["skincare", "apparel", "pet", "home", "fitness", "beverage", "jewelry", "supplement", "baby", "accessories", "unknown-thing", ""];
const SCORES = [0, 15, 30, 39, 40, 54, 55, 69, 70, 84, 85, 100];
const AOVS = [5, 9, 25, 60, 150, 600];
const BUDGETS = [3, 5, 10, 50, 200, 1000];
const COUNTRIES: SimulatorCountry[] = ["US", "EU-W", "EU-S", "LATAM", "INDIA-SEA", "WW"];
const PRODUCTS: SimulatorProductType[] = ["physical", "digital", "subscription", "service"];
const RIVALS: SimulatorCompetitiveness[] = ["low", "medium", "high", "extreme"];

function* grid(): Generator<SimInputs> {
  let k = 0;
  for (const niche of NICHES)
    for (const score of SCORES)
      for (const aovUsd of AOVS)
        for (const dailyBudgetUsd of BUDGETS) {
          // Rotate the remaining dimensions so every value is exercised without a 10^6 grid.
          k++;
          yield {
            niche,
            score,
            aovUsd,
            dailyBudgetUsd,
            marginPct: k % 3 === 0 ? null : [15, 30, 50, 80][k % 4],
            country: COUNTRIES[k % COUNTRIES.length],
            productType: PRODUCTS[k % PRODUCTS.length],
            competitiveness: RIVALS[k % RIVALS.length],
            month: k % 12,
          };
        }
}

test("conservative ≤ balanced ≤ aggressive in ROAS and purchases for every input", () => {
  let n = 0;
  for (const i of grid()) {
    n++;
    const s = simulateAll(i);
    const t = (v: "conservative" | "balanced" | "aggressive") => s[v].totals;
    assert.ok(t("conservative").roas <= t("balanced").roas + 1e-9, `roas c≤b ${JSON.stringify(i)}`);
    assert.ok(t("balanced").roas <= t("aggressive").roas + 1e-9, `roas b≤a ${JSON.stringify(i)}`);
    assert.ok(t("conservative").purchases <= t("balanced").purchases + 1e-9, `purchases c≤b ${JSON.stringify(i)}`);
    assert.ok(t("balanced").purchases <= t("aggressive").purchases + 1e-9, `purchases b≤a ${JSON.stringify(i)}`);
    assert.ok(t("conservative").spend < t("balanced").spend && t("balanced").spend < t("aggressive").spend);
  }
  assert.ok(n > 4000, `grid too small: ${n}`);
});

test("the funnel arithmetic holds on every day and totals are the sums of the days", () => {
  for (const i of grid()) {
    const s = simulateAll(i);
    for (const v of ["conservative", "balanced", "aggressive"] as const) {
      const sc = s[v];
      assert.equal(sc.days.length, 7);
      for (const d of sc.days) {
        // impressions = spend / CPM · 1000 (display values are rounded)
        assert.ok(Math.abs(d.impressions - (d.spend / d.cpm) * 1000) <= Math.max(2, d.impressions * 0.01), `impr ${v}`);
        // revenue per day ≤ what AOV × purchases allows (purchases/revenue are rounded to cents)
        assert.ok(Math.abs(d.revenue - d.purchases * i.aovUsd) <= 0.01 * Math.max(1, i.aovUsd) + 0.01 * d.purchases, `rev ${v}`);
        assert.ok(Math.abs(d.roas - (d.spend > 0 ? d.revenue / d.spend : 0)) <= 0.011, `roas ${v}`);
        assert.ok(d.purchases >= 0 && d.revenue >= 0 && d.spend >= 0 && d.clicks <= d.impressions + 1);
        assert.ok(d.ctr >= 0 && d.ctr <= 0.08, `ctr is a decimal ≤ 8% (${d.ctr})`);
      }
      const sum = (k: "spend" | "revenue" | "purchases") => sc.days.reduce((a, d) => a + d[k], 0);
      assert.ok(Math.abs(sc.totals.spend - sum("spend")) < 0.05);
      assert.ok(Math.abs(sc.totals.revenue - sum("revenue")) < 0.05);
      assert.ok(Math.abs(sc.totals.purchases - sum("purchases")) < 0.05);
    }
  }
});

test("hard ceilings: ROAS never exceeds the score ceiling, the variant cap or 6x", () => {
  for (const i of grid()) {
    const s = simulateAll(i);
    const ceil = scoreRoasCeiling(Math.max(0, Math.min(100, i.score)));
    for (const v of ["conservative", "balanced", "aggressive"] as const) {
      assert.ok(s[v].totals.roas <= Math.min(ceil, 6) + 0.011, `${v} ${s[v].totals.roas} > ${ceil} for ${JSON.stringify(i)}`);
      for (const d of s[v].days) assert.ok(d.roas <= Math.min(ceil, 6) + 0.011, `${v} day ${d.day} roas ${d.roas} > ${ceil}`);
    }
    if (i.score < 40) assert.ok(s.aggressive.totals.roas <= 1.2 + 0.011, "weak stores never project > 1.2x");
  }
  assert.equal(scoreRoasCeiling(39), 1.2);
  assert.equal(scoreRoasCeiling(85), 5.5);
});

test("a weaker audit score never projects better than a stronger one (same niche and inputs)", () => {
  for (const niche of NICHES)
    for (const aovUsd of AOVS) {
      let prev = -1;
      for (const score of [0, 20, 35, 50, 60, 75, 90, 100]) {
        const r = simulateAll({ niche, score, aovUsd, dailyBudgetUsd: 100, month: 3 }).balanced.totals.roas;
        assert.ok(r >= prev - 1e-9, `${niche} aov ${aovUsd}: score ${score} → ${r} < ${prev}`);
        prev = r;
      }
    }
});

test("sensitivity: higher AOV ⇒ more revenue/ROAS; higher budget ⇒ more spend and purchases", () => {
  for (const niche of NICHES)
    for (const score of [30, 60, 90]) {
      const base: SimInputs = { niche, score, aovUsd: 40, dailyBudgetUsd: 100, month: 5 };
      const a = simulateAll(base).balanced.totals;
      const richer = simulateAll({ ...base, aovUsd: 120 }).balanced.totals;
      assert.ok(richer.revenue >= a.revenue && richer.roas >= a.roas, `${niche}/${score} AOV`);
      const bigger = simulateAll({ ...base, dailyBudgetUsd: 400 }).balanced.totals;
      assert.ok(bigger.spend > a.spend && bigger.purchases >= a.purchases, `${niche}/${score} budget`);
    }
  // And it is not vacuous: in an uncapped regime AOV actually moves the number.
  const lo = simulateAll({ niche: "skincare", score: 80, aovUsd: 20, dailyBudgetUsd: 100, month: 3 }).balanced.totals.roas;
  const hi = simulateAll({ niche: "skincare", score: 80, aovUsd: 40, dailyBudgetUsd: 100, month: 3 }).balanced.totals.roas;
  assert.ok(hi > lo);
});

test("country and rivalry move cost in the right direction", () => {
  const b: SimInputs = { niche: "apparel", score: 70, aovUsd: 60, dailyBudgetUsd: 100, month: 6 };
  const us = simulateAll({ ...b, country: "US" }).balanced.days[3].cpm;
  const latam = simulateAll({ ...b, country: "LATAM" }).balanced.days[3].cpm;
  assert.ok(latam < us);
  const lowC = simulateAll({ ...b, competitiveness: "low" }).balanced.days[3].cpm;
  const extreme = simulateAll({ ...b, competitiveness: "extreme" }).balanced.days[3].cpm;
  assert.ok(extreme > lowC);
});

test("the learning phase is visible: day 1 converts worse than day 4", () => {
  const s = simulateAll({ niche: "pet", score: 80, aovUsd: 60, dailyBudgetUsd: 100, month: 2 }).balanced;
  assert.ok(s.days[0].roas < s.days[3].roas);
});

test("break-even is visible and coherent with the margin", () => {
  const i: SimInputs = { niche: "skincare", score: 80, aovUsd: 60, dailyBudgetUsd: 100, marginPct: 25, month: 3 };
  const s = simulateAll(i);
  for (const v of ["conservative", "balanced", "aggressive"] as const) {
    const e = s[v].economics!;
    assert.equal(e.break_even_roas, 4); // 100 / 25
    assert.equal(e.margin_pct, 25);
    const net = (s[v].totals.revenue * 25) / 100 - s[v].totals.spend;
    assert.ok(Math.abs(e.net_after_ads - net) < 0.05);
    if (e.verdict === "profit") assert.ok(e.net_after_ads > 0);
    if (e.verdict === "loss") assert.ok(e.net_after_ads < 0);
    // ROAS below break-even must never be reported as profit.
    if (s[v].totals.roas < e.break_even_roas - 0.01) assert.notEqual(e.verdict, "profit");
  }
  assert.equal(simulateAll({ ...i, marginPct: null }).balanced.economics, undefined);
  assert.equal(simulateAll({ ...i, marginPct: 0 }).balanced.economics, undefined);
  assert.equal(simulateAll({ ...i, marginPct: 50 }).balanced.economics!.break_even_roas, 2);
});

test("results are ranges, not false precision: point estimate sits inside a non-degenerate band", () => {
  for (const i of grid()) {
    const t = simulateAll(i).balanced.totals;
    assert.ok(t.roas_range[0] >= 0 && t.roas_range[0] <= t.roas + 0.011 && t.roas <= t.roas_range[1] + 0.011);
    if (t.roas > 0.2) assert.ok(t.roas_range[1] > t.roas_range[0]);
  }
});

test("deterministic: same inputs ⇒ identical output", () => {
  const i: SimInputs = { niche: "home", score: 62, aovUsd: 80, dailyBudgetUsd: 150, marginPct: 40, month: 10 };
  assert.deepEqual(simulateAll(i), simulateAll({ ...i }));
});

test("garbage inputs don't produce NaN/Infinity", () => {
  const s = simulateAll({ niche: undefined, score: NaN, aovUsd: 0, dailyBudgetUsd: 0, month: 99 });
  for (const v of Object.values(s)) {
    for (const d of v.days) for (const x of Object.values(d)) assert.ok(Number.isFinite(x as number));
    for (const x of Object.values(v.totals).flat()) assert.ok(Number.isFinite(x as number));
  }
});

test("the narrative fallback states the numbers honestly and never promises", () => {
  const i: SimInputs = { niche: "skincare", score: 30, aovUsd: 60, dailyBudgetUsd: 100, marginPct: 40, month: 3 };
  const s = simulateAll(i);
  const n = fallbackNarrative(s.conservative, { score: 30 });
  assert.match(n.summary, /ROAS/);
  assert.match(n.summary, /model, not a guarantee/i);
  assert.match(n.recommendation, /fix the top issues/i);
  assert.ok(n.risks.length >= 3);
  const noMargin = fallbackNarrative(simulateAll({ ...i, marginPct: null }).balanced, { score: 80 });
  assert.match(noMargin.win_condition, /Add your margin/i);
});

test("sanitizeNarrative rejects unusable model output", () => {
  assert.equal(sanitizeNarrative(null), null);
  assert.equal(sanitizeNarrative({ summary: "x" }), null);
  assert.equal(sanitizeNarrative({ summary: "fine summary", win_condition: "win cond", risks: [], recommendation: "do this now" }), null);
  const ok = sanitizeNarrative({ summary: "fine summary", win_condition: "win cond", risks: ["r1", 5, ""], recommendation: "do this now" });
  assert.deepEqual(ok?.risks, ["r1"]);
});

// ── Optimizer targets (brief §4.1: targets inside niche benchmarks) ────────────
import { clampOptimizerTargets } from "../../lib/meta/optimizer-targets";
import { nicheBenchmarks } from "../../lib/meta/niche-benchmarks";
import { roasRangeForAudit } from "../../lib/meta/roas-range";

test("optimizer targets always land inside the niche bands and the audit's modeled ROAS range", () => {
  const wild = { cpc: 9, cpm: 90, ctr: 0.15, roas: 8, cvr: 0.2 };
  const tiny = { cpc: 0.01, cpm: 1, ctr: 0.001, roas: 0.5, cvr: 0.001 };
  for (const niche of NICHES.filter(Boolean)) {
    for (const score of [10, 35, 55, 75, 95]) {
      const bands = nicheBenchmarks(niche)!;
      const rr = roasRangeForAudit(score, niche);
      for (const raw of [wild, tiny]) {
        const { targets: t } = clampOptimizerTargets(raw, niche, score);
        assert.ok(t.cpm >= bands.cpm[0] && t.cpm <= bands.cpm[1], `cpm ${niche}`);
        assert.ok(t.ctr >= bands.ctr[0] - 1e-9 && t.ctr <= bands.ctr[1] + 1e-9, `ctr ${niche}`);
        assert.ok(t.cvr >= bands.cvr[0] - 1e-9 && t.cvr <= bands.cvr[1] + 1e-9, `cvr ${niche}`);
        assert.ok(t.roas >= rr.low - 1e-9 && t.roas <= rr.high + 1e-9, `roas ${niche}/${score}`);
        assert.ok(Math.abs(t.cpc - t.cpm / 1000 / t.ctr) <= 0.01, "cpc agrees with cpm and ctr");
      }
    }
  }
});

test("targets already inside the bands are left alone; a weak store can't be promised a strong ROAS", () => {
  const bands = nicheBenchmarks("skincare")!;
  const mid = {
    cpm: (bands.cpm[0] + bands.cpm[1]) / 2,
    ctr: (bands.ctr[0] + bands.ctr[1]) / 2,
    cvr: (bands.cvr[0] + bands.cvr[1]) / 2,
    roas: roasRangeForAudit(70, "skincare").low + 0.1,
    cpc: 0,
  };
  mid.cpc = Math.round((mid.cpm / 1000 / mid.ctr) * 100) / 100;
  const out = clampOptimizerTargets(mid, "skincare", 70);
  assert.deepEqual(out.adjusted, []);
  const weak = clampOptimizerTargets({ ...mid, roas: 4 }, "skincare", 25);
  assert.ok(weak.targets.roas <= roasRangeForAudit(25, "skincare").high);
  assert.ok(weak.adjusted.includes("roas"));
});

test("the optimizer and the simulator tell the same story: same benchmark table", () => {
  const t = simulateAll({ niche: "pet", score: 70, aovUsd: 50, dailyBudgetUsd: 100, month: 2 }).balanced.days[3];
  const bands = nicheBenchmarks("pet")!;
  // The simulator's day-4 CPM (no learning penalty, US, medium rivalry) sits inside the same band the optimizer is clamped to.
  assert.ok(t.cpm >= bands.cpm[0] * 0.9 && t.cpm <= bands.cpm[1] * 1.3);
});

test("ordering survives rounding at tiny budgets/AOVs (regression: totals were summed from rounded days)", () => {
  const bad: SimInputs = { niche: "Electronics", score: 54, aovUsd: 10, dailyBudgetUsd: 5, marginPct: 30, country: "CA", productType: "service", competitiveness: "medium", month: 9 };
  const s = simulateAll(bad);
  assert.ok(s.conservative.totals.roas <= s.balanced.totals.roas && s.balanced.totals.roas <= s.aggressive.totals.roas);
  assert.ok(s.conservative.totals.purchases <= s.balanced.totals.purchases && s.balanced.totals.purchases <= s.aggressive.totals.purchases);
  // Deterministic fuzz over the whole low-budget corner.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let k = 0; k < 20000; k++) {
    const i: SimInputs = {
      niche: NICHES[Math.floor(rnd() * NICHES.length)],
      score: Math.floor(rnd() * 101),
      aovUsd: Math.round(1 + rnd() * 300),
      dailyBudgetUsd: Math.round((1 + rnd() * 30) * 100) / 100,
      country: COUNTRIES[Math.floor(rnd() * COUNTRIES.length)],
      productType: PRODUCTS[Math.floor(rnd() * PRODUCTS.length)],
      competitiveness: RIVALS[Math.floor(rnd() * RIVALS.length)],
      month: Math.floor(rnd() * 12),
    };
    const r = simulateAll(i);
    assert.ok(r.conservative.totals.roas <= r.balanced.totals.roas && r.balanced.totals.roas <= r.aggressive.totals.roas, JSON.stringify(i));
    assert.ok(r.conservative.totals.purchases <= r.balanced.totals.purchases && r.balanced.totals.purchases <= r.aggressive.totals.purchases, JSON.stringify(i));
  }
});

test("niches the Library actually produces map to a benchmark row, not the generic fallback", () => {
  const generic = nicheBenchmarks("zzz-unknown")!;
  for (const n of ["wellness", "grooming", "eyewear", "skincare", "pet", "baby", "home", "apparel", "beverage", "accessories", "footwear", "fitness", "beauty"]) {
    const b = nicheBenchmarks(n)!;
    assert.notDeepEqual(b.cpm, generic.cpm, n);
  }
});
