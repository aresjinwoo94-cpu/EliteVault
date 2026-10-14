import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Stripe from "stripe";
import { settleReportUnlock, isReportUnlockSession, type UnlockRow, type UnlockStore } from "../../lib/unlocks/settle";
import { hasFullReport, REPORT_UNLOCK_USD_CENTS } from "../../lib/unlocks/report-unlock";

/** WP-2 (brief oct-2026 §4): entitlement + idempotent, safe settlement of the $7 unlock. */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

class FakeStore implements UnlockStore {
  owners = new Map<string, string>([["A1", "U1"], ["A2", "U2"]]);
  unlocks = new Map<string, UnlockRow & { status: string }>();
  refunds: { pi: string; key: string }[] = [];
  async getAnalysisOwner(id: string) {
    return this.owners.get(id) ?? null;
  }
  async getUnlock(id: string) {
    return this.unlocks.get(id) ?? null;
  }
  async insertUnlock(row: UnlockRow) {
    const sessions = [...this.unlocks.values()].map((u) => u.stripe_session_id);
    if (this.unlocks.has(row.analysis_id) || sessions.includes(row.stripe_session_id)) return "conflict" as const;
    this.unlocks.set(row.analysis_id, { ...row, status: "paid" });
    return "inserted" as const;
  }
  async refundPaymentIntent(pi: string, key: string) {
    if (!this.refunds.some((r) => r.key === key)) this.refunds.push({ pi, key });
  }
}

const session = (over: Partial<Stripe.Checkout.Session> & { metadata?: Record<string, string> } = {}): Stripe.Checkout.Session =>
  ({
    id: "cs_1",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 700,
    currency: "usd",
    metadata: { purchase: "report_unlock", supabase_user_id: "U1", analysis_id: "A1" },
    ...over,
  }) as Stripe.Checkout.Session;

test("a paid unlock session for the owner creates exactly one entitlement", async () => {
  const s = new FakeStore();
  assert.deepEqual(await settleReportUnlock(session(), s), { kind: "unlocked" });
  assert.equal(s.unlocks.size, 1);
  assert.equal(s.unlocks.get("A1")!.stripe_payment_intent, "pi_1");
  assert.equal(s.refunds.length, 0);
});

test("idempotent: webhook + return page (same session) settle once; a replay is a no-op", async () => {
  const s = new FakeStore();
  await settleReportUnlock(session(), s);
  assert.deepEqual(await settleReportUnlock(session(), s), { kind: "already_unlocked" });
  assert.deepEqual(await settleReportUnlock(session(), s), { kind: "already_unlocked" });
  assert.equal(s.unlocks.size, 1);
  assert.equal(s.refunds.length, 0, "the same payment is never refunded");
});

test("two tabs pay two sessions for the same audit: the second is refunded automatically", async () => {
  const s = new FakeStore();
  await settleReportUnlock(session({ id: "cs_1", payment_intent: "pi_1" }), s);
  const second = await settleReportUnlock(session({ id: "cs_2", payment_intent: "pi_2" }), s);
  assert.deepEqual(second, { kind: "duplicate_refunded" });
  assert.deepEqual(s.refunds, [{ pi: "pi_2", key: "unlock-duplicate-cs_2" }]);
  assert.equal(s.unlocks.size, 1);
  assert.equal(s.unlocks.get("A1")!.stripe_session_id, "cs_1");
  // delivery of the second event again does not refund twice (idempotency key)
  await settleReportUnlock(session({ id: "cs_2", payment_intent: "pi_2" }), s);
  assert.equal(s.refunds.length, 1);
});

test("foreign metadata: the audit belongs to someone else → no entitlement, payment refunded", async () => {
  const s = new FakeStore();
  const r = await settleReportUnlock(session({ metadata: { purchase: "report_unlock", supabase_user_id: "U1", analysis_id: "A2" } }), s);
  assert.deepEqual(r, { kind: "owner_mismatch", refunded: true });
  assert.equal(s.unlocks.size, 0);
  assert.equal(s.refunds.length, 1);
  // missing metadata / unknown audit behave the same
  assert.equal((await settleReportUnlock(session({ metadata: { purchase: "report_unlock" } }), s)).kind, "owner_mismatch");
  assert.equal((await settleReportUnlock(session({ metadata: { purchase: "report_unlock", supabase_user_id: "U1", analysis_id: "NOPE" } }), s)).kind, "owner_mismatch");
  assert.equal(s.unlocks.size, 0);
});

test("not paid yet (async method) or not an unlock session: nothing happens", async () => {
  const s = new FakeStore();
  assert.deepEqual(await settleReportUnlock(session({ payment_status: "unpaid" }), s), { kind: "unpaid" });
  assert.deepEqual(await settleReportUnlock(session({ mode: "subscription" }), s), { kind: "ignored" });
  assert.deepEqual(await settleReportUnlock(session({ metadata: { purchase: "blocks_export" } }), s), { kind: "ignored" });
  assert.equal(s.unlocks.size, 0);
  assert.equal(s.refunds.length, 0);
  assert.equal(isReportUnlockSession(session()), true);
  assert.equal(isReportUnlockSession(session({ mode: "subscription" })), false);
});

test("hasFullReport: a paid plan or an unlock, nothing else; free/unknown is closed", () => {
  assert.equal(hasFullReport({ plan: "free" }), false);
  assert.equal(hasFullReport({ plan: null }), false);
  assert.equal(hasFullReport({ plan: "free", unlocked: false }), false);
  assert.equal(hasFullReport({ plan: "free", unlocked: true }), true);
  assert.equal(hasFullReport({ plan: "pro" }), true);
  assert.equal(REPORT_UNLOCK_USD_CENTS, 700);
});

test("the webhook sends unlock sessions to settlement, never to subscription sync; failures un-dedupe the event", () => {
  const src = read("app/api/stripe/webhook/route.ts");
  assert.match(src, /isReportUnlockSession\(event\.data\.object/);
  assert.match(src, /if \(unlockSession\) \{\s*await settleReportUnlock\(unlockSession, createUnlockStore\(\)\);\s*return NextResponse\.json/);
  // the unlock branch comes BEFORE the switch that calls syncSubscription
  assert.ok(src.indexOf("settleReportUnlock(unlockSession") < src.indexOf("await syncSubscription(event, service)"));
  for (const ev of ["EV_ASYNC_OK", "EV_ASYNC_FAILED", "charge.refunded"]) assert.match(src.slice(src.indexOf("const RELEVANT_EVENTS")), new RegExp(ev));
  assert.match(src, /if \(unlockRelated\) \{\s*await service\.from\("stripe_events"\)\.delete\(\)\.eq\("id", event\.id\)/);
  // plan code untouched
  assert.match(src, /async function onInvoicePaid/);
});

test("a refunded unlock re-locks only its own payment; the duplicate auto-refund matches no row", () => {
  const src = read("app/api/stripe/webhook/route.ts");
  const fn = src.slice(src.indexOf("async function onChargeRefunded"), src.indexOf("async function syncSubscription"));
  assert.match(fn, /charge\.refunded !== true/);
  assert.match(fn, /\.eq\("stripe_payment_intent", pi\)/);
  assert.match(fn, /status: "refunded"/);
});

test("REPORT_UNLOCK is OFF by default and the entitlement is only consulted when it is on", () => {
  assert.match(read("lib/flags.ts"), /reportUnlockEnabled\(\): boolean \{\s*return enabled\("REPORT_UNLOCK", false\);/);
  const ent = read("lib/unlocks/entitlement.ts");
  assert.ok(ent.indexOf("if (!reportUnlockEnabled()) return false;") < ent.indexOf("isAnalysisUnlocked(p.analysisId"));
});

test("isPaid / viewer are derived from the full-report decision on every path that serves the report", () => {
  assert.match(read("app/(app)/app/analyzer/[id]/page.tsx"), /const isPaid = fullReport;/);
  assert.match(read("app/(app)/app/analyzer/[id]/page.tsx"), /hasFullReport: fullReport/);
  assert.match(read("app/api/analyses/[id]/route.ts"), /resolveFullReport\(\{ analysisId: id/);
  assert.match(read("app/api/analyses/[id]/growth-map/route.ts"), /const isPaid = await resolveFullReport/);
  assert.match(read("app/api/analyses/[id]/fix-tracks/[track]/route.ts"), /resolveFullReport\(\{ analysisId: id/);
});

test("the unlock is not a plan: PLANS, /pricing and the landing pricing never mention it", () => {
  for (const f of ["lib/stripe/plans.ts", "app/pricing/page.tsx", "components/marketing/pricing.tsx", "components/billing/plan-card.tsx"]) {
    let src = "";
    try {
      src = read(f);
    } catch {
      continue;
    }
    assert.doesNotMatch(src, /report[_ -]?unlock|REPORT_UNLOCK/i, f);
  }
});
