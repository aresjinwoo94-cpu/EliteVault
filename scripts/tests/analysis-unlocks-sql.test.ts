import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/** WP-2 — migration 0043 for real: one unlock per audit, one per Stripe session, only the service role writes. */
const db = new PGlite();
const U = "00000000-0000-0000-0000-0000000000b1";
const A1 = "00000000-0000-0000-0000-0000000000c1";
const A2 = "00000000-0000-0000-0000-0000000000c2";

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table profiles (id uuid primary key);
    create table analyses (id uuid primary key, user_id uuid references profiles(id));
    insert into profiles values ('${U}');
    insert into analyses values ('${A1}','${U}'), ('${A2}','${U}');
  `);
  await db.exec(readFileSync(resolve(process.cwd(), "supabase/migrations/0043_analysis_unlocks.sql"), "utf8"));
  await db.exec(readFileSync(resolve(process.cwd(), "supabase/migrations/0043_analysis_unlocks.sql"), "utf8")); // idempotent
});

const ins = (a: string, s: string, status = "paid") =>
  db.exec(`insert into analysis_unlocks (analysis_id, user_id, stripe_session_id, status) values ('${a}','${U}','${s}','${status}')`);

test("one unlock per audit: a second row for the same audit is rejected", async () => {
  await ins(A1, "cs_a");
  await assert.rejects(ins(A1, "cs_b"), /unique|duplicate|primary/i);
});

test("one unlock per Stripe session: the same session can't unlock two audits", async () => {
  await assert.rejects(ins(A2, "cs_a"), /unique|duplicate/i);
  await ins(A2, "cs_c");
});

test("status is paid|refunded only", async () => {
  await assert.rejects(db.exec(`update analysis_unlocks set status='free' where analysis_id='${A1}'`), /check/i);
  await db.exec(`update analysis_unlocks set status='refunded', refunded_at=now() where analysis_id='${A1}'`);
});

test("the buyer can read their own unlock; no client role can write", async () => {
  const p = (await db.query<{ cmd: string }>(`select cmd from pg_policies where tablename='analysis_unlocks'`)).rows;
  assert.deepEqual(p.map((r) => r.cmd), ["SELECT"]);
  const g = (
    await db.query<{ role: string; priv: string }>(
      `select grantee role, privilege_type priv from information_schema.role_table_grants where table_name='analysis_unlocks' and grantee in ('anon','authenticated')`,
    )
  ).rows;
  assert.ok(!g.some((r) => ["INSERT", "UPDATE", "DELETE"].includes(r.priv)), JSON.stringify(g));
});

test("deleting the audit removes its unlock (no orphans)", async () => {
  await db.exec(`delete from analyses where id='${A2}'`);
  assert.equal((await db.query<{ n: number }>(`select count(*)::int n from analysis_unlocks where analysis_id='${A2}'`)).rows[0].n, 0);
});
