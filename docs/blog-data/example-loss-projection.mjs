// Real example output for the "honest story" (brief §B2): a Meta Campaign Simulator run that projected a loss in
// all three scenarios, plus the audit verdict that explains it. Sanitized: no URL, no analysis id, no user id,
// no store name — only the niche label, the inputs and the model's own output.
//
// Run: node docs/blog-data/example-loss-projection.mjs  → docs/blog-data/example-loss-projection.json
// Read-only (scripts/blog/_supa.mjs). Selects the simulation by its inputs (AOV $35, $100/day, 2026-10-21).
import fs from "node:fs";
import { select } from "../../scripts/blog/_supa.mjs";

const [sim] = await select(
  "meta_simulations",
  "select=created_at,analysis_id,aov_usd,daily_budget_usd,product_margin_pct,notes,conservative,balanced,aggressive&status=eq.succeeded&aov_usd=eq.35&daily_budget_usd=eq.100&order=created_at.desc&limit=1",
);
if (!sim) throw new Error("simulation not found");
const [audit] = await select("analyses", `select=detected_niche,result&id=eq.${sim.analysis_id}`);

const scen = (s) => ({
  totals: s.totals,
  days_roas: s.days.map((d) => d.roas),
  summary: s.summary,
  win_condition: s.win_condition,
  risks: s.risks,
  recommendation: s.recommendation, // shown in the UI under "Tactical move"
});

const out = {
  provenance:
    "Real output of EliteVault's Meta Campaign Scenario Modeler for one audited store (identity withheld). MODELED projection, not campaign results. Numbers come from the deterministic engine (lib/meta/simulation-engine.ts); the text around them is written by the AI.",
  date: sim.created_at.slice(0, 10),
  audit: {
    niche: audit.detected_niche,
    score: audit.result?.score ?? null,
    ad_readiness: { verdict: audit.result?.ad_readiness?.verdict, blockers: (audit.result?.ad_readiness?.blockers ?? []).map((b) => b.title) },
  },
  inputs: { aov_usd: Number(sim.aov_usd), daily_budget_usd: Number(sim.daily_budget_usd), margin_pct: sim.product_margin_pct, country: "US", product_type: "physical", competitiveness: "medium" },
  scenarios: { conservative: scen(sim.conservative), balanced: scen(sim.balanced), aggressive: scen(sim.aggressive) },
};
fs.writeFileSync(new URL("./example-loss-projection.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("ok", out.audit, Object.values(out.scenarios).map((s) => s.totals.roas));
