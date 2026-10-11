/**
 * Side-effect guard: `import "./lib/require-jobs-key.mjs"` as the FIRST import of any offline
 * script that calls Gemini (ES module evaluation order guarantees it runs before
 * ai/providers/gemini.ts reads its key pool at import time).
 *
 * See scripts/lib/jobs-key.mjs for the rules. Exits 1 with an explanation when they aren't met.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyJobsGeminiEnv } from "./jobs-key.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ENV_FILE (if given) REPLACES .env.local; never override values already in the environment.
for (const file of [process.env.ENV_FILE ?? join(ROOT, ".env.local")]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* hosted cron / CI: env comes from the platform */
  }
}

const res = applyJobsGeminiEnv(process.env);
if (!res.ok) {
  console.error(`\n✗ Refusing to run: ${res.reason}\n`);
  process.exit(1);
}
