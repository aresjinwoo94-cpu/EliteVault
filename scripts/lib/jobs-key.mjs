/**
 * Offline jobs must NEVER spend the production Gemini quota.
 *
 * Why this exists (2026-10-09): discover / teardown / benchmark runs read the same
 * `GEMINI_API_KEY` that the live Analyzer uses. On the free tier the quota is per Google
 * project, so a batch job can exhaust it and make real users' audits fail with 429. The fix
 * is structural, not a promise: every script that calls Gemini imports
 * `scripts/lib/require-jobs-key.mjs` as its FIRST import, which
 *   1. refuses to run unless `GEMINI_API_KEY_JOBS` is set;
 *   2. refuses to run if that value is the same as any production key
 *      (`GEMINI_API_KEY`, `GEMINI_API_KEY_2..10`) — i.e. the prod key under another name;
 *   3. rewires the process so the shared provider (ai/providers/gemini.ts) sees ONLY the jobs
 *      key as its single key and the production pool is removed from the environment.
 * There is deliberately no override flag.
 *
 * Plain .mjs (no TypeScript) so .mjs and .mts scripts alike can import it.
 */

const PROD_KEY_NAMES = ["GEMINI_API_KEY", ...Array.from({ length: 9 }, (_, i) => `GEMINI_API_KEY_${i + 2}`)];

/** `vercel env pull` quotes values; .env.local doesn't. Compare on the bare value. */
function clean(v) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.replace(/^(["'])(.*)\1$/, "$2").trim();
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, key: string } | { ok: false, reason: string }}
 */
export function resolveJobsGeminiEnv(env) {
  const jobs = clean(env.GEMINI_API_KEY_JOBS);
  if (!jobs) {
    return {
      ok: false,
      reason:
        "GEMINI_API_KEY_JOBS is not set. Offline scripts must use a Gemini key that is NOT the one the live " +
        "Analyzer uses (a batch job can exhaust the shared free-tier quota and fail real users' audits). " +
        "Create a key in a SEPARATE Google project and set GEMINI_API_KEY_JOBS in .env.local.",
    };
  }
  for (const name of PROD_KEY_NAMES) {
    if (clean(env[name]) === jobs) {
      return {
        ok: false,
        reason:
          `GEMINI_API_KEY_JOBS has the same value as ${name}, which is a production key. ` +
          "The jobs key must come from a different Google project.",
      };
    }
  }
  return { ok: true, key: jobs };
}

/**
 * Make the provider see only the jobs key. Mutates `env` (normally process.env).
 * @param {Record<string, string | undefined>} env
 */
export function applyJobsGeminiEnv(env) {
  const r = resolveJobsGeminiEnv(env);
  if (!r.ok) return r;
  for (const name of PROD_KEY_NAMES.slice(1)) delete env[name];
  env.GEMINI_API_KEY = r.key;
  return r;
}
