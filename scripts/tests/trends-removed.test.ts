import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Brief oct-2026 §T — Trends is gone; keep it gone. */
const ROOT = process.cwd();
const DIRS = ["app", "components", "lib", "inngest"];

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(f)) out.push(p);
  }
  return out;
}

test("no Trends code, nav, i18n namespaces or cron remain", () => {
  for (const gone of [
    "app/(app)/app/trends",
    "components/trends",
    "lib/trends.ts",
    "inngest/functions/refresh-trends.ts",
  ]) {
    assert.equal(existsSync(join(ROOT, gone)), false, `${gone} must not exist`);
  }
  const re = /navTrends|trendsBoard|trendsPage|refresh-trends|trackedNiche|trends\/refresh/;
  const hits = DIRS.flatMap((d) => walk(join(ROOT, d))).filter((f) =>
    re.test(readFileSync(f, "utf8")),
  );
  assert.deepEqual(hits, []);
});

test("/app/trends permanently redirects to /app", () => {
  const cfg = readFileSync(join(ROOT, "next.config.mjs"), "utf8");
  assert.match(cfg, /source: "\/app\/trends", destination: "\/app", permanent: true/);
});
