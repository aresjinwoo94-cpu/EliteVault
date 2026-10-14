import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * §R P0 — migration 0042 run for real in an in-process Postgres (PGlite): atomic charge, exactly-once
 * refund whoever calls it, and the "refunded run that finishes keeps report AND credit" rule.
 * (PGlite is single-connection: the races are exercised in BOTH orders; the row lock + the UNIQUE ledger
 * indexes are what make true concurrency safe — the unique-index test proves the last line of defence.)
 */
const db = new PGlite();
const U = "00000000-0000-0000-0000-0000000000a1";
const U2 = "00000000-0000-0000-0000-0000000000a2";

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create type analysis_status as enum ('queued','running','succeeded','failed','refunded');
    create table profiles (id uuid primary key, credits int not null default 1);
    create table analyses (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references profiles(id) on delete cascade,
      url text, screenshot_url text, buyer_persona jsonb,
      status analysis_status not null default 'queued',
      error text, credits_charged int not null default 1,
      finished_at timestamptz, created_at timestamptz not null default now());
    insert into profiles (id, credits) values ('${U}', 1), ('${U2}', 5);
  `);
  await db.exec(readFileSync(resolve(process.cwd(), "supabase/migrations/0042_atomic_credits.sql"), "utf8"));
});

const credits = async (id = U) => (await db.query<{ credits: number }>(`select credits from profiles where id='${id}'`)).rows[0].credits;
const charge = async (id = U) => (await db.query<{ v: string | null }>(`select public.create_charged_analysis('${id}','https://s.com',null,null,1) v`)).rows[0].v;
const refund = async (aid: string, msg = "boom") => (await db.query<{ v: boolean }>(`select public.refund_analysis('${aid}', '${msg}') v`)).rows[0].v;
const events = async (aid: string, kind: string) =>
  (await db.query<{ n: number }>(`select count(*)::int n from credit_events where analysis_id='${aid}' and kind='${kind}'`)).rows[0].n;
const analysesOf = async (id = U) => (await db.query<{ n: number }>(`select count(*)::int n from analyses where user_id='${id}'`)).rows[0].n;

test("charge is atomic: debits one credit and creates the audit; never goes negative", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = await charge();
  assert.ok(id);
  assert.equal(await credits(), 0);
  assert.equal(await events(id!, "charge"), 1);
  const created = await analysesOf();
  assert.equal(await charge(), null, "no credit left → nothing created, nothing charged");
  assert.equal(await credits(), 0);
  assert.equal(await analysesOf(), created);
});

test("double refund call: the credit comes back exactly once", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = (await charge())!;
  assert.equal(await credits(), 0);
  assert.equal(await refund(id), true);
  assert.equal(await credits(), 1);
  assert.equal(await refund(id), false, "second call is a no-op");
  assert.equal(await refund(id), false);
  assert.equal(await credits(), 1);
  assert.equal(await events(id, "refund"), 1);
});

test("race onFailure vs poller — poller first, then onFailure: +1 only", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = (await charge())!;
  assert.equal(await refund(id, "poller: stale"), true);
  assert.equal(await refund(id, "onFailure: step failed"), false);
  assert.equal(await credits(), 1);
});

test("race onFailure vs poller — onFailure first, then poller: +1 only", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = (await charge())!;
  assert.equal(await refund(id, "onFailure: step failed"), true);
  assert.equal(await refund(id, "poller: stale"), false);
  assert.equal(await credits(), 1);
});

test("the ledger UNIQUE index makes a second refund impossible even bypassing the function", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = (await charge())!;
  await refund(id);
  await assert.rejects(
    db.exec(`insert into credit_events (user_id, analysis_id, kind, delta) values ('${U}','${id}','refund',1)`),
    /unique|duplicate/i,
  );
});

test("a refunded run that then SUCCEEDS keeps report and credit, and is flagged", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = (await charge())!;
  await refund(id, "poller: stale");
  assert.equal(await credits(), 1);
  await db.exec(`update analyses set status='succeeded' where id='${id}'`); // what save-result does
  assert.equal(await credits(), 1, "no credit is taken back");
  const row = (await db.query<{ status: string; succeeded_after_refund: boolean }>(`select status, succeeded_after_refund from analyses where id='${id}'`)).rows[0];
  assert.equal(row.status, "succeeded");
  assert.equal(row.succeeded_after_refund, true);
  assert.equal(await events(id, "succeeded_after_refund"), 1);
  assert.equal(await refund(id), false, "a finished audit can never be refunded again");
  assert.equal(await credits(), 1);
});

test("a finished (succeeded) audit is never refunded or demoted by a late failure", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = (await charge())!;
  await db.exec(`update analyses set status='succeeded' where id='${id}'`);
  assert.equal(await refund(id, "late onFailure"), false);
  assert.equal(await credits(), 0);
  assert.equal((await db.query<{ status: string }>(`select status from analyses where id='${id}'`)).rows[0].status, "succeeded");
  assert.equal((await db.query<{ f: boolean }>(`select succeeded_after_refund f from analyses where id='${id}'`)).rows[0].f, false);
});

test("anonymous audits flip to refunded with no credit movement; claimed-anonymous (never charged) audits are not credited", async () => {
  const anon = (await db.query<{ id: string }>(`insert into analyses (user_id, url) values (null,'https://a.com') returning id`)).rows[0].id;
  assert.equal(await refund(anon, "anon timed out"), true);
  assert.equal(await refund(anon), false);
  // an anonymous audit claimed by U mid-run: user_id set later, never charged, created after the ledger started
  await db.exec(`update credit_ledger_meta set started_at = now() - interval '1 hour'`);
  const claimed = (await db.query<{ id: string }>(`insert into analyses (user_id, url) values ('${U}','https://c.com') returning id`)).rows[0].id;
  const before = await credits();
  assert.equal(await refund(claimed), true);
  assert.equal(await credits(), before, "no ledger charge → no credit");
  assert.equal(await events(claimed, "refund"), 0);
});

test("an audit created BEFORE the ledger existed is still credited back", async () => {
  await db.exec(`update credit_ledger_meta set started_at = now() + interval '1 hour'`);
  const legacy = (await db.query<{ id: string }>(`insert into analyses (user_id, url) values ('${U2}','https://old.com') returning id`)).rows[0].id;
  const before = await credits(U2);
  assert.equal(await refund(legacy), true);
  assert.equal(await credits(U2), before + 1);
  assert.equal(await events(legacy, "refund"), 1);
});

test("only the service role may call the money functions", async () => {
  const r = (
    await db.query<{ anon: boolean; auth: boolean; svc: boolean }>(`
    select has_function_privilege('anon','public.refund_analysis(uuid,text)','execute') anon,
           has_function_privilege('authenticated','public.refund_analysis(uuid,text)','execute') auth,
           has_function_privilege('service_role','public.refund_analysis(uuid,text)','execute') svc`)
  ).rows[0];
  assert.deepEqual(r, { anon: false, auth: false, svc: true });
  const c = (
    await db.query<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon','public.create_charged_analysis(uuid,text,text,jsonb,int)','execute') anon, has_function_privilege('authenticated','public.create_charged_analysis(uuid,text,text,jsonb,int)','execute') auth`,
    )
  ).rows[0];
  assert.deepEqual(c, { anon: false, auth: false });
});

test("a refunded audit that a retried step moved to 'running' and then succeeds is still flagged", async () => {
  await db.exec(`update profiles set credits = 1 where id='${U}'`);
  const id = (await charge())!;
  await refund(id, "poller: stale");
  await db.exec(`update analyses set status='running' where id='${id}'`);
  assert.equal(await refund(id, "late onFailure"), false, "refunded_at blocks a second refund even while 'running'");
  await db.exec(`update analyses set status='succeeded' where id='${id}'`);
  assert.equal((await db.query<{ f: boolean }>(`select succeeded_after_refund f from analyses where id='${id}'`)).rows[0].f, true);
  assert.equal(await credits(), 1);
});

test("a non-positive cost is rejected (no free audits, no minted credits)", async () => {
  await assert.rejects(db.query(`select public.create_charged_analysis('${U}','https://x.com',null,null,0)`), /p_cost/);
  await assert.rejects(db.query(`select public.create_charged_analysis('${U}','https://x.com',null,null,-5)`), /p_cost/);
});
