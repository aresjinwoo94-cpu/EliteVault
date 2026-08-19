import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WP-6 — every migration must be safe to re-apply.
 *
 * `npm run db:migrate` can replay the whole directory against production, and
 * the runner now also skips files it has already recorded. Both of those only
 * hold up if a re-run is a no-op rather than an error: a migration that throws
 * `42710 duplicate_object` halfway through leaves the schema half-applied and
 * the ledger disagreeing with reality — which is exactly the drift this WP is
 * paying down.
 *
 * Postgres gives idempotency two different ways, and both are accepted here:
 *   • the declarative one — `if not exists` / `or replace`
 *   • the guarded one — `drop … if exists` first, or a `do $$ … exception when
 *     duplicate_object` block (the only option for CREATE POLICY / CREATE TYPE,
 *     which have no `if not exists` form)
 *
 * This is a STATIC check over the .sql files. It needs no database, so it runs
 * in the normal test suite and catches a non-replayable migration at review
 * time instead of halfway through a production run.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

interface Violation {
  file: string;
  rule: string;
  target: string;
}

/** Strip line comments so prose in a header can't trip the patterns. */
function sqlOf(raw: string): string {
  return raw.replace(/--[^\n]*/g, "").toLowerCase();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the statement at `index` sits inside a `do $$ … exception when
 * duplicate_object … end $$` block — the standard guard for the statements
 * Postgres gives no `if not exists` form.
 */
function insideDuplicateObjectGuard(sql: string, index: number): boolean {
  const blockStart = sql.lastIndexOf("do $$", index);
  if (blockStart === -1) return false;
  const blockEnd = sql.indexOf("end $$", index);
  if (blockEnd === -1) return false;
  // A previous block that already closed before us doesn't count.
  const closedBefore = sql.indexOf("end $$", blockStart);
  if (closedBefore !== -1 && closedBefore < index) return false;
  return /exception\s+when\s+duplicate_object/.test(
    sql.slice(blockStart, blockEnd),
  );
}

function auditFile(file: string, raw: string): Violation[] {
  const sql = sqlOf(raw);
  const out: Violation[] = [];
  const flag = (rule: string, target: string) => out.push({ file, rule, target });

  for (const m of sql.matchAll(/create\s+table\s+(?!if\s+not\s+exists)(\S+)/g)) {
    flag("create table needs `if not exists`", m[1]);
  }
  for (const m of sql.matchAll(
    /create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists|concurrently)(\S+)/g,
  )) {
    flag("create index needs `if not exists`", m[1]);
  }
  for (const m of sql.matchAll(/create\s+extension\s+(?!if\s+not\s+exists)(\S+)/g)) {
    flag("create extension needs `if not exists`", m[1]);
  }
  for (const m of sql.matchAll(/add\s+column\s+(?!if\s+not\s+exists)(\S+)/g)) {
    flag("add column needs `if not exists`", m[1]);
  }
  for (const m of sql.matchAll(/create\s+(function|view)\s+(\S+)/g)) {
    // `create or replace` is matched by the negative form below, so reaching
    // here means the bare `create` was used.
    if (!/or\s+replace/.test(sql.slice(Math.max(0, m.index - 20), m.index))) {
      flag(`create ${m[1]} needs \`or replace\``, m[2]);
    }
  }
  for (const m of sql.matchAll(/create\s+type\s+(\S+)/g)) {
    if (!insideDuplicateObjectGuard(sql, m.index)) {
      flag("create type needs a duplicate_object guard", m[1]);
    }
  }
  for (const m of sql.matchAll(/create\s+policy\s+("[^"]+"|\S+)\s+on\s+(\S+)/g)) {
    const [, name, table] = m;
    const dropped = new RegExp(
      `drop\\s+policy\\s+if\\s+exists\\s+${escape(name)}\\s+on\\s+${escape(table)}`,
    ).test(sql.slice(0, m.index));
    if (!dropped && !insideDuplicateObjectGuard(sql, m.index)) {
      flag("create policy needs a drop-if-exists or duplicate_object guard", `${name} on ${table}`);
    }
  }
  for (const m of sql.matchAll(/create\s+trigger\s+(\S+)/g)) {
    const dropped = new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${escape(m[1])}\\b`).test(
      sql.slice(0, m.index),
    );
    if (!dropped && !insideDuplicateObjectGuard(sql, m.index)) {
      flag("create trigger needs a drop-if-exists", m[1]);
    }
  }
  return out;
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql") && !f.includes("_rollback"))
  .sort();

test("there are migrations to check (the glob didn't silently match nothing)", () => {
  assert.ok(files.length > 0, `no .sql files found in ${MIGRATIONS_DIR}`);
});

test("every migration is safe to re-apply", () => {
  const violations = files.flatMap((f) =>
    auditFile(f, readFileSync(join(MIGRATIONS_DIR, f), "utf8")),
  );
  const report = violations
    .map((v) => `  ${v.file}: ${v.rule} → ${v.target}`)
    .join("\n");
  assert.equal(
    violations.length,
    0,
    `re-running these migrations would error rather than no-op:\n${report}`,
  );
});

test("rollbacks stay out of the migrations directory", () => {
  // A `*_rollback.sql` sorts right after the migration it undoes, so one
  // landing here would silently revert it on the next full run. The runner
  // filters them out defensively; this makes the mistake loud at review time.
  const strays = readdirSync(MIGRATIONS_DIR).filter((f) => f.includes("_rollback"));
  assert.deepEqual(strays, [], "rollbacks belong in supabase/rollbacks/");
});

test("the idempotency rules actually catch a bad migration", () => {
  // Guards the guard: a typo that made every pattern match nothing would
  // otherwise turn this whole file into a test that always passes.
  const bad = `
    create table public.oops (id uuid primary key);
    create policy "oops: read" on public.oops for select using (true);
    alter table public.thing add column shiny text;
  `;
  const rules = auditFile("synthetic.sql", bad).map((v) => v.rule);
  assert.equal(rules.length, 3, `expected 3 violations, got ${rules.join(" | ")}`);
});

test("the accepted guard forms are recognised as idempotent", () => {
  const good = `
    create table if not exists public.ok (id uuid primary key);
    do $$ begin
      create type mood as enum ('good');
    exception when duplicate_object then null; end $$;
    drop policy if exists "ok: read" on public.ok;
    create policy "ok: read" on public.ok for select using (true);
    do $$ begin
      create policy "ok: write" on public.ok for insert with check (true);
    exception when duplicate_object then null; end $$;
    alter table public.ok add column if not exists shiny text;
    create or replace function public.noop() returns void as $$ begin end; $$ language plpgsql;
  `;
  assert.deepEqual(auditFile("synthetic.sql", good), []);
});
