/**
 * Read-only schema drift check: does the live database actually have what the
 * migrations in this repo define?
 *
 * Usage:
 *   npm run db:doctor
 *
 * # Why this exists (WP-6)
 * `lib/quota/guard.ts` carries a comment saying production's `profiles` table
 * is missing a column that migration 0001 defines, "never applied". That kind
 * of note is impossible to act on: it can't be verified, it goes stale, and it
 * teaches everyone to distrust the migrations and start hand-casting types
 * around them. This script replaces the belief with a diff.
 *
 * It reads the .sql files to work out the expected tables and columns, reads
 * information_schema to see what's really there, and prints the difference.
 * It runs SELECTs only — it never writes, and it never applies anything. Fixing
 * what it reports is `npm run db:migrate` (or a new reconciliation migration).
 *
 * Limitations, stated honestly: the expectation set comes from regex over
 * `create table` / `add column`, so a column introduced by an exotic DDL form
 * may not be expected here. Columns present in the database but absent from the
 * migrations are reported as EXTRA rather than as an error — they're usually
 * Supabase-managed or applied by hand, which is itself worth seeing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

async function query(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) {
    console.error(`✗ query failed — HTTP ${res.status}`);
    console.error((await res.text()).slice(0, 800));
    process.exit(1);
  }
  return res.json();
}

// ── What the migrations say should exist ───────────────────────────────────
/** table name → Set(column names) */
const expected = new Map();
const add = (table, column) => {
  const key = table.replace(/^public\./, "").replace(/"/g, "");
  if (!expected.has(key)) expected.set(key, new Set());
  if (column) expected.get(key).add(column);
};

for (const file of readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql") && !f.includes("_rollback"))
  .sort()) {
  const sql = readFileSync(join("supabase/migrations", file), "utf8")
    .replace(/--[^\n]*/g, "")
    .toLowerCase();

  // create table [if not exists] public.x ( col type, col type, … )
  for (const m of sql.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(\S+)\s*\(([\s\S]*?)\n\s*\);/g,
  )) {
    const table = m[1];
    if (table.startsWith("storage.") || table.startsWith("auth.")) continue;
    add(table, null);
    // Split on top-level commas only — a `numeric(10,2)` or a multi-column
    // constraint must not be read as two columns.
    let depth = 0;
    let current = "";
    const parts = [];
    for (const ch of m[2]) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
      } else current += ch;
    }
    parts.push(current);
    for (const part of parts) {
      const name = part.trim().split(/\s+/)[0];
      if (!name) continue;
      // Table-level constraints aren't columns.
      if (
        ["primary", "unique", "foreign", "constraint", "check", "exclude"].includes(name)
      )
        continue;
      add(table, name);
    }
  }

  // alter table public.x add column [if not exists] y …
  for (const m of sql.matchAll(
    /alter\s+table\s+(?:if\s+exists\s+)?(\S+)([\s\S]*?);/g,
  )) {
    const table = m[1];
    if (table.startsWith("storage.") || table.startsWith("auth.")) continue;
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\S+)/g)) {
      add(table, c[1]);
    }
  }
}

// ── What the database really has ───────────────────────────────────────────
// BASE TABLE only. Views are derived objects created with `create or replace
// view`, so they're never in the expected set and would otherwise every one of
// them show up as EXTRA — noise that makes a clean report look dirty.
const rows = await query(
  `select c.table_name, c.column_name
     from information_schema.columns c
     join information_schema.tables t
       on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position;`,
);

const actual = new Map();
for (const r of rows) {
  if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
  actual.get(r.table_name).add(r.column_name);
}

// ── Diff ───────────────────────────────────────────────────────────────────
console.log(`\nSchema doctor — ${ref}\n`);

const missingTables = [];
const missingColumns = [];
const extraColumns = [];

for (const [table, cols] of [...expected].sort()) {
  const live = actual.get(table);
  if (!live) {
    missingTables.push(table);
    continue;
  }
  for (const c of [...cols].sort()) if (!live.has(c)) missingColumns.push(`${table}.${c}`);
  for (const c of [...live].sort()) if (!cols.has(c)) extraColumns.push(`${table}.${c}`);
}

// The ledger is created by the migration RUNNER, not by a migration, so it is
// expected to be here and is not worth reporting as a surprise.
const extraTables = [...actual.keys()]
  .filter((t) => !expected.has(t) && t !== "schema_migrations")
  .sort();

if (missingTables.length) {
  console.log("MISSING TABLES — the migrations define these, the database doesn't have them:");
  for (const t of missingTables) console.log(`  ✗ ${t}`);
  console.log("");
}
if (missingColumns.length) {
  console.log("MISSING COLUMNS — this is real drift; run `npm run db:migrate`:");
  for (const c of missingColumns) console.log(`  ✗ ${c}`);
  console.log("");
}
if (extraTables.length || extraColumns.length) {
  console.log("EXTRA — in the database but not in any migration (often fine: applied by");
  console.log("hand or managed by Supabase — but nothing in this repo recreates them):");
  for (const t of extraTables) console.log(`  · table  ${t}`);
  for (const c of extraColumns) console.log(`  · column ${c}`);
  console.log("");
}

const drift = missingTables.length + missingColumns.length;
console.log(
  `${expected.size} tables expected · ${actual.size} present · ${drift} missing`,
);
if (drift === 0) {
  console.log("\n✓ No drift: production has everything the migrations define.\n");
} else {
  console.log("\n✗ Drift found. Fix with `npm run db:migrate`, then re-run this.\n");
}
// exitCode, not process.exit(): forcing exit while the fetch keep-alive socket
// is still open trips a libuv assertion on Windows, which turns a clean report
// into a scary-looking crash. Let the event loop drain instead.
process.exitCode = drift === 0 ? 0 : 1;
