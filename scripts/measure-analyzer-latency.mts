/**
 * WP-C — latency measurement against the real analyzer agent.
 *
 * Usage:
 *   npx tsx --tsconfig scripts/tests/tsconfig.json scripts/measure-analyzer-latency.mts
 *
 * NOT part of `npm run test`: real, paid Gemini calls over the network.
 *
 * # Why this exists
 * The brief asks for a ~30s typical audit and a before/after table. Both
 * demand numbers, and the one number this repo never had is how long the vision
 * call actually takes on real pages under the REAL budget. Every previous
 * measurement in this codebase used a generous deadline, which hides the
 * failure mode that matters: production gives each Inngest step 50s
 * (lib/deadline.ts, sized for Vercel Hobby's 60s ceiling), and an audit that
 * takes 88s doesn't run slowly — it refunds.
 *
 * So every run here uses STEP_BUDGET_MS, not a comfortable one.
 *
 * # What it compares
 * ANALYZER_MAX_TOKENS. The call site carries a recorded experiment saying 16384
 * "traded truncation for timeouts", but a live run showed 2 of 3 real stores
 * hitting the 8192 ceiling and paying a full second call for it. Those two
 * claims can't both be the whole story, and the default should follow the
 * measurement rather than either argument.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const k = line.slice(0, line.indexOf("=")).trim();
  const v = line.slice(line.indexOf("=") + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const BUCKET =
  "https://bniqrniajswqvzkhklad.supabase.co/storage/v1/object/public/screenshots/";

/** Real production captures, spanning the weight range the brief cares about. */
const FIXTURES = [
  {
    name: "vitallivingstore (light)",
    file: "022f4f42-d9b9-49ea-a669-16c31e02bfab.jpg",
    mediaType: "image/jpeg" as const,
    url: "https://vitallivingstore.com",
  },
  {
    name: "thejerseynation (normal)",
    file: "92f1166c-0f66-47a2-8705-133755b839f6.png",
    mediaType: "image/png" as const,
    url: "https://www.thejerseynation.com/products/shoot",
  },
  {
    name: "brilliantearth PDP (very tall)",
    file: "0c51260b-9d2d-4bc8-8a2d-661b93e60b39.jpg",
    mediaType: "image/jpeg" as const,
    url: "https://www.brilliantearth.com/Beveled-Edge-Matte-5.5mm-Wedding-Ring",
  },
];

const CEILINGS = [8192, 16384];

async function fetchBase64(file: string): Promise<string> {
  const res = await fetch(BUCKET + file);
  if (!res.ok) throw new Error(`fixture fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

const images = new Map<string, string>();
for (const fx of FIXTURES) images.set(fx.file, await fetchBase64(fx.file));

console.log(
  `\nEach run gets the REAL production step budget. A run that exceeds it is what\n` +
    `a user experiences as a refund, not as a slow audit.\n`,
);
console.log(
  "fixture".padEnd(32) + "ceiling".padStart(8) + "time".padStart(9) + "  outcome",
);
console.log("─".repeat(72));

const results: { name: string; ceiling: number; secs: number; ok: boolean }[] = [];

for (const ceiling of CEILINGS) {
  // Read at module load, so the agent must be re-imported per setting.
  process.env.ANALYZER_MAX_TOKENS = String(ceiling);
  const mod = await import(`../ai/agents/analyzer-agent?ceiling=${ceiling}`);
  const { runAnalyzerAgent } = mod as typeof import("../ai/agents/analyzer-agent");
  const { STEP_BUDGET_MS } = await import("../lib/deadline");

  for (const fx of FIXTURES) {
    const started = Date.now();
    let ok = false;
    let note = "";
    try {
      const audit = await runAnalyzerAgent({
        screenshotBase64: images.get(fx.file)!,
        mediaType: fx.mediaType,
        url: fx.url,
        siteInfo: null,
        deadlineAt: Date.now() + STEP_BUDGET_MS,
      });
      ok = true;
      note = `${audit.top_fixes?.length ?? 0} fixes · ${audit.annotations?.length ?? 0} annotations`;
    } catch (err) {
      note = `FAILED — ${(err as Error).message.slice(0, 60)}`;
    }
    const secs = (Date.now() - started) / 1000;
    results.push({ name: fx.name, ceiling, secs, ok });
    console.log(
      fx.name.padEnd(32) +
        String(ceiling).padStart(8) +
        `${secs.toFixed(1)}s`.padStart(9) +
        `  ${ok ? "ok" : "REFUND"} · ${note}`,
    );
  }
}

console.log("\n── summary ──");
for (const ceiling of CEILINGS) {
  const rows = results.filter((r) => r.ceiling === ceiling);
  const okRows = rows.filter((r) => r.ok);
  const avg = okRows.length
    ? (okRows.reduce((a, r) => a + r.secs, 0) / okRows.length).toFixed(1)
    : "—";
  console.log(
    `ceiling ${String(ceiling).padStart(5)}: ${okRows.length}/${rows.length} completed · avg ${avg}s of those that did`,
  );
}
console.log(
  "\nThe default only moves if the higher ceiling completes AT LEAST as many\n" +
    "audits. Faster-but-fails-more is a worse product, per the brief.\n",
);
