/**
 * Run any .sql file against Supabase via the Management API.
 *
 * Usage:
 *   npm run db:migrate                          (runs all migrations 0001…)
 *   npm run db:migrate -- supabase/migrations/0003_community_meta_api.sql
 *
 * The Management API needs a Personal Access Token (SUPABASE_PAT in
 * .env.local) — that's how the dashboard SQL editor authenticates too.
 * Service-role keys can't run arbitrary DDL.
 *
 * Idempotent migrations are recommended (all our 000X files use
 * `if not exists`, `do $$ … exception when duplicate_object`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const pat = env.SUPABASE_PAT;
const ref = env.SUPABASE_PROJECT_REF;
if (!pat || !ref) {
  console.error("✗ SUPABASE_PAT and SUPABASE_PROJECT_REF must be in .env.local");
  process.exit(1);
}

const ENDPOINT = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(sql, label) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${label} — HTTP ${res.status}`);
    console.error(text.slice(0, 800));
    return false;
  }
  console.log(`✓ ${label}`);
  return true;
}

const arg = process.argv[2];
const files = arg
  ? [arg]
  : readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join("supabase/migrations", f));

console.log(`\nRunning ${files.length} migration(s) against ${ref}…\n`);

let okCount = 0;
for (const f of files) {
  const sql = readFileSync(f, "utf8");
  const ok = await runSql(sql, basename(f));
  if (ok) okCount++;
}

console.log(`\n${okCount}/${files.length} applied.`);
process.exit(okCount === files.length ? 0 : 2);
