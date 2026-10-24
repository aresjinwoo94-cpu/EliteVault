import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** §R P0 — no read-modify-write on audit credits is left in the audit code paths. */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const PATHS = [
  "app/actions/analyzer.ts",
  "app/api/v1/analyses/route.ts",
  "app/api/analyses/[id]/route.ts",
  "app/api/anon-analyses/[id]/route.ts",
  "inngest/functions/analyze-website.ts",
];

test("no code path writes profiles.credits for audits any more (charge/refund go through Postgres)", () => {
  for (const p of PATHS) {
    const code = read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.doesNotMatch(code, /credits\s*:\s*[\w.]*credits\s*[-+]/, `${p}: read-modify-write on credits`);
    assert.doesNotMatch(code, /\.update\(\s*\{\s*credits\b/, `${p}: direct credits update`);
  }
});

test("charging goes through create_charged_analysis and every refund through refund_analysis", () => {
  assert.match(read("app/actions/analyzer.ts"), /chargeAndCreateAnalysis/);
  assert.match(read("app/api/v1/analyses/route.ts"), /chargeAndCreateAnalysis/);
  for (const p of ["app/api/analyses/[id]/route.ts", "app/api/anon-analyses/[id]/route.ts", "inngest/functions/analyze-website.ts"]) {
    assert.match(read(p), /refundAnalysis\(/, p);
  }
  const lib = read("lib/credits.ts");
  assert.match(lib, /rpc\("create_charged_analysis"/);
  assert.match(lib, /rpc\("refund_analysis"/);
});

test("onFailure no longer demotes/refunds by hand (it used to refund even an already-refunded audit)", () => {
  const src = read("inngest/functions/analyze-website.ts");
  const onFailure = src.slice(src.indexOf("onFailure:"), src.indexOf('{ event: "analysis/requested" }'));
  assert.doesNotMatch(onFailure, /status:\s*"refunded"/);
  assert.match(onFailure, /refundAnalysis\(service, data\.analysisId/);
});

test("a charged audit that cannot be queued is refunded right away (createAnalysis and API v1)", () => {
  for (const p of ["app/actions/analyzer.ts", "app/api/v1/analyses/route.ts"]) {
    const src = read(p);
    const afterCharge = src.slice(src.indexOf("chargeAndCreateAnalysis("));
    assert.match(afterCharge, /try \{\s*await inngest\.send/, `${p}: send inside try`);
    assert.match(afterCharge, /catch \(e\)[\s\S]*refundAnalysis\(service, row\.id/, `${p}: refund on send failure`);
  }
  assert.match(read("inngest/functions/analyze-website.ts"), /\.neq\("status", "refunded"\)/, "mark-running never overwrites 'refunded'");
});
