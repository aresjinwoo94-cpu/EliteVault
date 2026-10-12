import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * WP-0 (docs/brief-2026-10-unlock-trends-library-landing.md §2) — migration
 * 0039 closes the hole where any signed-in user could `update profiles set
 * plan='scale', credits=9999` with the public anon key. These tests pin the
 * allowlists so a future edit can't quietly re-open it.
 */
const ROOT = process.cwd();
const sql = readFileSync(
  resolve(ROOT, "supabase/migrations/0039_protect_privileged_columns.sql"),
  "utf8",
);

function allowlist(fn: string): string[] {
  const body = sql.slice(sql.indexOf(`function public.${fn}`));
  const m = body.match(/to_jsonb\(new\) - array\[([^\]]*)\]/);
  assert.ok(m, `${fn}: allowlist not found`);
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

test("profiles allowlist never includes billing / quota columns", () => {
  const allowed = allowlist("tg_protect_profiles_columns");
  for (const col of [
    "plan",
    "credits",
    "stripe_customer_id",
    "email",
    "id",
    "first_value_at",
    "activation_emailed_at",
    "acq_channel",
  ]) {
    assert.ok(!allowed.includes(col), `profiles.${col} must stay server-only`);
  }
  assert.ok(allowed.includes("full_name"), "updateProfile writes full_name");
});

test("analyses allowlist is only the share link", () => {
  assert.deepEqual(allowlist("tg_protect_analyses_columns").sort(), [
    "share_slug",
    "shared_at",
  ]);
});

test("triggers key off current_user (unspoofable) and are installed", () => {
  assert.match(sql, /current_user in \('anon', 'authenticated'\)/);
  for (const t of [
    "profiles_protect_columns",
    "analyses_protect_columns",
    "analyses_protect_insert",
    "meta_simulations_protect_update",
    "meta_simulations_protect_insert",
    "api_keys_protect_update",
  ]) {
    assert.match(sql, new RegExp(`create trigger ${t} before (update|insert)`));
  }
  assert.match(sql, /drop policy if exists "analyses: insert own"/);
});

test("createAnalysis writes profiles + analyses with the service client", () => {
  const src = readFileSync(resolve(ROOT, "app/actions/analyzer.ts"), "utf8");
  const writes = [...src.matchAll(/(\w+)\s*\.from\("(profiles|analyses)"\)\s*\.(update|insert)\(/g)];
  assert.ok(writes.length >= 3);
  for (const w of writes) assert.equal(w[1], "service", "credits/audits are server-owned");
});
