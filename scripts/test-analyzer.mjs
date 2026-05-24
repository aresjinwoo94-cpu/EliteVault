/**
 * Runs the real Analyzer agent (same code the Inngest job uses) against a
 * real ecommerce screenshot. Validates Zod schema, prints the audit.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const [k, v] of Object.entries(env)) process.env[k] = v;

console.log(`Provider: ${process.env.AI_PROVIDER}`);
console.log(`Model:    ${process.env.GEMINI_MODEL}\n`);

// Use tsx so we can import the TS agent directly
const { spawnSync } = await import("node:child_process");
const res = spawnSync(
  process.execPath,
  ["--import", "tsx", join(__dirname, "test-analyzer-inner.ts")],
  { stdio: "inherit", env: process.env },
);
process.exit(res.status ?? 0);
