/**
 * Shared plumbing for the Library jobs (FASE A).
 *
 * Every job in this folder is designed to be run repeatedly — by hand today,
 * by a scheduler tomorrow — with the same three properties:
 *
 *   IDEMPOTENT   Re-running produces the same DB state. Writes are upserts or
 *                targeted updates keyed on the row id; nothing is appended.
 *   BATCHED      Work is chunked and paced (`mapSettled` + `sleep`) so we never
 *                fire thousands of requests at a third party in a burst.
 *   NON-FATAL    One bad row is logged and skipped. `Promise.allSettled`
 *                semantics throughout — a single failure never aborts a batch.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Load .env.local into process.env (same convention as the other scripts). */
export function loadEnv(): void {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    // CI / hosted cron: env comes from the platform, not a file.
  }
}

/** Service-role Supabase client. Exits loudly if the env isn't there. */
export function serviceClient(): SupabaseClient {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exit with a code the caller can trust.
 *
 * `process.exit()` immediately after an HTTP round-trip aborts Node on Windows
 * with a libuv assertion (the keep-alive socket is still closing), and the
 * shell then sees 127 instead of our code — which would quietly break
 * `npm run library:audit` as a deploy gate. Yielding first lets those handles
 * finish closing.
 */
export async function exitWith(code: number): Promise<never> {
  await sleep(150);
  process.exitCode = code;
  process.exit(code);
}

/** Split a list into fixed-size chunks. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface BatchOutcome<T> {
  ok: T[];
  failed: { input: unknown; error: string }[];
}

/**
 * Run `fn` over `items` in paced batches, collecting failures instead of
 * throwing. This is the "backfill en lotes con rate limit" requirement: N in
 * flight, a pause between batches, and a per-row error log.
 */
export async function mapSettled<In, Out>(
  items: In[],
  fn: (item: In) => Promise<Out>,
  opts: { concurrency?: number; delayMs?: number; label?: string } = {},
): Promise<BatchOutcome<Out>> {
  const concurrency = opts.concurrency ?? 5;
  const delayMs = opts.delayMs ?? 400;
  const out: BatchOutcome<Out> = { ok: [], failed: [] };
  const batches = chunk(items, concurrency);

  for (let b = 0; b < batches.length; b++) {
    const results = await Promise.allSettled(batches[b].map(fn));
    results.forEach((r, i) => {
      if (r.status === "fulfilled") out.ok.push(r.value);
      else
        out.failed.push({
          input: batches[b][i],
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
    });
    if (opts.label) {
      const done = Math.min((b + 1) * concurrency, items.length);
      process.stdout.write(`\r  ${opts.label}: ${done}/${items.length}   `);
    }
    if (b < batches.length - 1) await sleep(delayMs);
  }
  if (opts.label) process.stdout.write("\n");
  return out;
}

/**
 * `is this site up?` — HEAD first (cheap), GET fallback for the many stores
 * that answer 405 to HEAD. Never throws; a timeout counts as down.
 */
export async function probeLive(
  url: string,
  timeoutMs = 12_000,
): Promise<boolean> {
  for (const method of ["HEAD", "GET"] as const) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          // Plain, identifiable UA. Storefronts commonly 403 an empty one.
          "user-agent":
            "Mozilla/5.0 (compatible; EliteVaultBot/1.0; +https://elitevaultapp.com)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.status < 400) return true;
      // 403/405 on HEAD is a bot rule, not a dead store — try GET before
      // declaring it down.
      if (method === "GET") return false;
    } catch {
      if (method === "GET") return false;
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

/** `--flag value` / `-n 10` reader for the job CLIs. */
export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Detect whether the 0017 columns exist yet. Every job degrades to a clear
 * message instead of a wall of Postgres errors when the migration hasn't run.
 */
export async function requireExpansionColumns(
  svc: SupabaseClient,
): Promise<void> {
  const { error } = await svc
    .from("winning_sites")
    .select("status, is_live, momentum_score, domain_key")
    .limit(1);
  if (error) {
    console.error(
      "✗ winning_sites is missing the 0017 columns.\n" +
        "  Run: npm run db:migrate -- supabase/migrations/0017_library_expansion.sql\n" +
        `  (${error.message})`,
    );
    await exitWith(1);
  }
}
