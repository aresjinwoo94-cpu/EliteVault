/**
 * Run .sql migrations against Supabase via the Management API.
 *
 * Usage:
 *   npm run db:migrate                    apply every migration not yet recorded
 *   npm run db:migrate -- --status        show what's applied / pending, change nothing
 *   npm run db:migrate -- --dry-run       list what WOULD run, change nothing
 *   npm run db:migrate -- --all           re-apply every migration (they're idempotent)
 *   npm run db:migrate -- <file.sql>      apply one file (always runs, always records)
 *
 * The Management API needs a Personal Access Token (SUPABASE_PAT in
 * .env.local) — that's how the dashboard SQL editor authenticates too.
 * Service-role keys can't run arbitrary DDL.
 *
 * # Why there's a ledger now (WP-6)
 * This used to replay the WHOLE directory on every run, and record nothing.
 * That works only because every migration is idempotent — but it also means
 * the answer to "is production actually on the schema this code assumes?" was
 * unknowable, and that is precisely how the drift documented in
 * lib/quota/guard.ts survived unnoticed. `public.schema_migrations` makes the
 * applied set a fact you can query instead of a belief.
 *
 * The ledger is a RECORD, not a lock. Idempotency stays the real guarantee —
 * `--all` exists so a suspected-drifted database can be brought back in line by
 * replaying everything, and `scripts/tests/migrations-idempotent.test.ts` keeps
 * that safe. A checksum is stored per file so an edited migration is reported
 * rather than silently skipped.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";

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

/** Run SQL and return parsed rows, or null on failure (error already logged). */
async function query(sql, label) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${label} — HTTP ${res.status}`);
    console.error(text.slice(0, 800));
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

const checksum = (sql) => createHash("sha256").update(sql).digest("hex").slice(0, 16);

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const explicitFile = argv.find((a) => !a.startsWith("--"));
const statusOnly = flags.has("--status");
const dryRun = flags.has("--dry-run");
const runAll = flags.has("--all");

// ── The ledger ─────────────────────────────────────────────────────────────
// Created before anything else, and itself idempotent, so a database that has
// never seen this runner bootstraps cleanly.
const ledgerReady = await query(
  `create table if not exists public.schema_migrations (
     filename text primary key,
     checksum text not null,
     applied_at timestamptz not null default now()
   );
   alter table public.schema_migrations enable row level security;`,
  "ledger: public.schema_migrations",
);
if (ledgerReady === null) {
  console.error("\n✗ could not create/read the migration ledger — aborting.");
  process.exit(1);
}

const appliedRows =
  (await query(
    "select filename, checksum, applied_at from public.schema_migrations;",
    "ledger: read",
  )) ?? [];
const applied = new Map(appliedRows.map((r) => [r.filename, r]));

// Rollbacks live in supabase/rollbacks/ and are never picked up here. This
// filter is belt-and-braces: a `*_rollback.sql` that ever lands in
// supabase/migrations/ would otherwise sort right after the migration it undoes
// and silently revert it on the next run.
const allFiles = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql") && !f.includes("_rollback"))
  .sort();

// ── --status: report and exit ──────────────────────────────────────────────
if (statusOnly) {
  console.log(`\nSchema status for ${ref}\n`);
  let pending = 0;
  let drifted = 0;
  for (const f of allFiles) {
    const sql = readFileSync(join("supabase/migrations", f), "utf8");
    const rec = applied.get(f);
    if (!rec) {
      pending++;
      console.log(`  PENDING  ${f}`);
    } else if (rec.checksum !== checksum(sql)) {
      drifted++;
      console.log(`  EDITED   ${f}  (applied ${rec.applied_at} — the file changed since)`);
    } else {
      console.log(`  applied  ${f}`);
    }
  }
  const orphans = [...applied.keys()].filter((f) => !allFiles.includes(f));
  for (const f of orphans) console.log(`  ORPHAN   ${f}  (recorded, but no such file)`);
  console.log(
    `\n${allFiles.length - pending}/${allFiles.length} applied · ${pending} pending · ${drifted} edited-after-apply`,
  );
  if (drifted > 0) {
    console.log(
      "\nAn EDITED migration means the file no longer matches what production ran.\n" +
        "Prefer a NEW migration that reconciles the difference; use --all only if you\n" +
        "are sure re-applying the edited file is what you want.",
    );
  }
  process.exit(0);
}

// ── Choose the work ────────────────────────────────────────────────────────
let files;
if (explicitFile) {
  files = [explicitFile];
} else if (runAll) {
  files = allFiles.map((f) => join("supabase/migrations", f));
} else {
  files = allFiles
    .filter((f) => !applied.has(f))
    .map((f) => join("supabase/migrations", f));
  const skipped = allFiles.length - files.length;
  if (skipped > 0) {
    console.log(`(${skipped} already recorded — use --all to re-apply everything)`);
  }
}

if (files.length === 0) {
  console.log("\nNothing to apply — the ledger is up to date.\n");
  process.exit(0);
}

if (dryRun) {
  console.log(`\nWould run ${files.length} migration(s) against ${ref}:\n`);
  for (const f of files) console.log(`  ${basename(f)}`);
  console.log("\n(dry run — nothing was applied)\n");
  process.exit(0);
}

console.log(`\nRunning ${files.length} migration(s) against ${ref}…\n`);

let okCount = 0;
let failed = null;
for (const f of files) {
  const sql = readFileSync(f, "utf8");
  const name = basename(f);
  const result = await query(sql, name);
  if (result === null) {
    // STOP on the first failure. The old runner kept going, which was
    // survivable when it replayed everything every time — but migrations are
    // ordered and later ones assume earlier ones landed, so continuing past a
    // failure produces a half-applied schema AND a ledger that disagrees with
    // it. Failing loudly at the first bad file is what makes `--status`
    // trustworthy afterwards.
    failed = name;
    break;
  }
  console.log(`✓ ${name}`);
  okCount++;
  // Record only after the migration itself succeeded, so a failed run never
  // leaves the ledger claiming something that didn't happen.
  await query(
    `insert into public.schema_migrations (filename, checksum)
     values ('${name.replace(/'/g, "''")}', '${checksum(sql)}')
     on conflict (filename) do update
       set checksum = excluded.checksum, applied_at = now();`,
    `ledger: record ${name}`,
  );
}

console.log(`\n${okCount}/${files.length} applied.`);
if (failed) {
  console.error(
    `\n✗ stopped at ${failed}. Nothing after it was attempted, and it was NOT\n` +
      `  recorded in the ledger. Fix the migration, then re-run — the files that\n` +
      `  already succeeded will be skipped. \`--status\` shows where you are.`,
  );
}
process.exit(failed ? 2 : 0);
