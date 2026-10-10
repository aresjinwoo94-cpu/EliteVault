import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
// @ts-expect-error — plain .mjs shared by .mjs and .mts scripts
import { applyJobsGeminiEnv, resolveJobsGeminiEnv } from "../lib/jobs-key.mjs";

/**
 * Offline jobs must never spend the production Gemini quota (2026-10-09 incident review).
 * Three layers are pinned here: the pure rules, the real process behaviour, and a scan that
 * makes it impossible to add a Gemini-using script without the guard.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const GUARD = resolve(ROOT, "scripts/lib/require-jobs-key.mjs");

// ── 1. rules ────────────────────────────────────────────────────────────────

test("refuses to run when only the production key exists", () => {
  const r = resolveJobsGeminiEnv({ GEMINI_API_KEY: "prod-1", GEMINI_API_KEY_2: "prod-2" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /GEMINI_API_KEY_JOBS is not set/);
  assert.equal(resolveJobsGeminiEnv({ GEMINI_API_KEY_JOBS: "   " }).ok, false);
  assert.equal(resolveJobsGeminiEnv({}).ok, false);
});

test("refuses a jobs key that is a production key under another name (any of the 10 slots, quotes ignored)", () => {
  for (const name of ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_7", "GEMINI_API_KEY_10"]) {
    const r = resolveJobsGeminiEnv({ [name]: "same-key", GEMINI_API_KEY_JOBS: "same-key" });
    assert.equal(r.ok, false, name);
    assert.match(r.reason, new RegExp(`same value as ${name}`));
  }
  // `vercel env pull` quotes values
  assert.equal(resolveJobsGeminiEnv({ GEMINI_API_KEY: '"abc"', GEMINI_API_KEY_JOBS: "abc" }).ok, false);
});

test("a distinct jobs key is accepted and becomes the ONLY key the provider can see", () => {
  const env: Record<string, string | undefined> = {
    GEMINI_API_KEY: "prod-1",
    GEMINI_API_KEY_2: "prod-2",
    GEMINI_API_KEY_6: "prod-6",
    GEMINI_API_KEY_JOBS: "jobs-key",
    GEMINI_MODEL: "gemini-x",
  };
  const r = applyJobsGeminiEnv(env);
  assert.equal(r.ok, true);
  assert.equal(env.GEMINI_API_KEY, "jobs-key");
  for (let i = 2; i <= 10; i++) assert.equal(env[`GEMINI_API_KEY_${i}`], undefined, `pool key ${i} removed`);
  assert.equal(env.GEMINI_MODEL, "gemini-x", "unrelated config is untouched");
  assert.ok(!Object.values(env).includes("prod-1") && !Object.values(env).includes("prod-6"), "no production key value survives");
});

test("a refused env is not mutated", () => {
  const env: Record<string, string | undefined> = { GEMINI_API_KEY: "prod", GEMINI_API_KEY_2: "p2" };
  const r = applyJobsGeminiEnv(env);
  assert.equal(r.ok, false);
  assert.deepEqual(env, { GEMINI_API_KEY: "prod", GEMINI_API_KEY_2: "p2" });
});

// ── 2. the real process ─────────────────────────────────────────────────────

function runGuard(env: Record<string, string>) {
  // ENV_FILE points nowhere → the guard reads ONLY the explicit env (no developer .env.local).
  return spawnSync(process.execPath, ["-e", `import(${JSON.stringify("file:///" + GUARD.replace(/\\/g, "/"))}).then(()=>{console.log("GEMINI_API_KEY="+process.env.GEMINI_API_KEY+";POOL2="+process.env.GEMINI_API_KEY_2)})`], {
    env: { PATH: process.env.PATH ?? "", ENV_FILE: resolve(ROOT, "does-not-exist.env"), ...env },
    encoding: "utf8",
  });
}

test("process: exits 1 with an explanation when only the production key is present", () => {
  const p = runGuard({ GEMINI_API_KEY: "prod-only" });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /Refusing to run/);
  assert.match(p.stderr, /GEMINI_API_KEY_JOBS/);
});

test("process: exits 1 when the jobs key equals a production key", () => {
  const p = runGuard({ GEMINI_API_KEY: "k", GEMINI_API_KEY_JOBS: "k" });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /same value as GEMINI_API_KEY/);
});

test("process: with a separate jobs key it runs, and the provider sees only that key", () => {
  const p = runGuard({ GEMINI_API_KEY: "prod", GEMINI_API_KEY_2: "prod2", GEMINI_API_KEY_JOBS: "jobs" });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /GEMINI_API_KEY=jobs;POOL2=undefined/);
});

// ── 3. nobody can forget it ─────────────────────────────────────────────────

/** Scripts that call Gemini on purpose with the PRODUCTION pool, and why. */
const EXEMPT: Record<string, string> = {
  "scripts/gemini-pool-check.mts": "ops diagnostic whose whole purpose is to probe the production key pool",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "tests" || name === "node_modules" || name === "lib") continue;
      walk(p, out);
    } else if (/\.(ts|mts|mjs|cjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const USES_GEMINI = /ai\/(provider|agents|providers)|GEMINI_API_KEY|new GoogleGenAI|@google\/genai|generativelanguage/;

test("every offline script that can call Gemini imports the jobs-key guard BEFORE it touches the AI layer", () => {
  const offenders: string[] = [];
  let checked = 0;
  for (const file of walk(resolve(ROOT, "scripts"))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    // comments don't count (docblocks mention the env var names)
    const code = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    if (!USES_GEMINI.test(code.replace(/require-jobs-key\.mjs/g, ""))) continue;
    if (EXEMPT[rel]) continue;
    checked++;
    const guardAt = code.indexOf("require-jobs-key.mjs");
    const aiAt = code.search(USES_GEMINI);
    if (guardAt < 0 || guardAt > aiAt) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `scripts that use Gemini without the guard first: ${offenders.join(", ")}`);
  assert.ok(checked >= 10, `scanner looks vacuous (only ${checked} scripts matched)`);
});

test("the exemption list stays minimal and justified", () => {
  assert.deepEqual(Object.keys(EXEMPT), ["scripts/gemini-pool-check.mts"]);
});
