/**
 * Applies a SQL migration via Supabase REST + admin RPC by POSTing to
 * the Postgres "query" endpoint that the SQL editor uses. We use the
 * pg-meta query endpoint which the service role can hit directly.
 *
 * Usage: node scripts/apply-migration.mjs <path-to-sql>
 *
 * NOTE: Supabase exposes a `pg-meta` endpoint at /pg/query that takes
 * arbitrary SQL — only the service role can call it. We use that here
 * so you don't have to paste SQL into the dashboard for every change.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <file.sql>");
  process.exit(1);
}
const sql = readFileSync(resolve(file), "utf8");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

// pg-meta lives at <project>.supabase.co/pg/query — but Supabase v2
// exposes it as part of the admin API. Newer self-hosted: /database/query.
// We try both.
const endpoints = [
  `${url}/pg/query`,
  `${url}/rest/v1/rpc/exec_sql`, // custom RPC, not built-in
];

let lastError = null;
for (const endpoint of endpoints) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      console.log(`✓ Applied via ${endpoint}`);
      process.exit(0);
    }
    lastError = `${res.status} ${await res.text()}`;
  } catch (e) {
    lastError = e.message;
  }
}

console.error("\n✗ Could not auto-apply. Falling back to manual instructions:\n");
console.error(`  1. Open https://supabase.com/dashboard/project/${url.match(/\/\/([^.]+)/)[1]}/sql/new`);
console.error(`  2. Paste the contents of ${file}`);
console.error("  3. Click Run\n");
console.error("Last error:", lastError);
process.exit(2);
