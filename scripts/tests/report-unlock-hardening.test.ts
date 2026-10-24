import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Stripe from "stripe";
import { processUnlockEvent, isUnlockEvent, EV_ASYNC_FAILED, EV_ASYNC_OK, type UnlockAlert, type UnlockEventDeps } from "../../lib/unlocks/process-event";
import { buildUnlockAlert } from "../../lib/unlocks/alert-content";
import type { UnlockRow, UnlockStore } from "../../lib/unlocks/settle";
import { messages } from "../../lib/i18n/messages";

/** Hardening after the adversarial review: retry after a crash, pending payments, owner alerts. */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

class Store implements UnlockStore {
  unlocks = new Map<string, UnlockRow & { status: string }>();
  refunds: string[] = [];
  crashOnInsert = 0; // how many inserts fail before succeeding ("the function died mid-settlement")
  async getAnalysisOwner(id: string) {
    return id === "A1" ? "U1" : null;
  }
  async getUnlock(id: string) {
    return this.unlocks.get(id) ?? null;
  }
  async getUnlockBySession(sid: string) {
    return [...this.unlocks.values()].find((u) => u.stripe_session_id === sid) ?? null;
  }
  async reactivateRefundedUnlock() {
    return false;
  }
  async insertUnlock(row: UnlockRow) {
    if (this.crashOnInsert > 0) {
      this.crashOnInsert--;
      throw new Error("function timed out");
    }
    if (this.unlocks.has(row.analysis_id)) return "conflict" as const;
    this.unlocks.set(row.analysis_id, { ...row, status: "paid" });
    return "inserted" as const;
  }
  async refundPaymentIntent(pi: string, key: string) {
    this.refunds.push(`${pi}:${key}`);
  }
}

const session = (over: Record<string, unknown> = {}) =>
  ({
    id: "cs_test_1",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 700,
    amount_subtotal: 700,
    currency: "usd",
    metadata: { purchase: "report_unlock", supabase_user_id: "U1", analysis_id: "A1" },
    ...over,
  }) as unknown as Stripe.Checkout.Session;

const ev = (type: string, object: unknown, id = "evt_1") => ({ id, type, data: { object } }) as unknown as Stripe.Event;

function setup(store = new Store()) {
  const processed: string[] = [];
  const alerts: UnlockAlert[] = [];
  const relocks: string[] = [];
  let relockFails = 0;
  let sessionOverride: Stripe.Checkout.Session | null = null;
  const deps: UnlockEventDeps = {
    store,
    retrieveSession: async (id) => sessionOverride ?? session({ id }),
    relockRefunded: async (c) => {
      if (relockFails > 0) {
        relockFails--;
        throw new Error("db down");
      }
      relocks.push(String(c.payment_intent));
    },
    markProcessed: async (e) => {
      processed.push(e.id);
    },
    alert: async (a) => {
      alerts.push(a);
    },
  };
  return { store, deps, processed, alerts, relocks, failRelock: (n: number) => (relockFails = n), useSession: (s: Stripe.Checkout.Session) => (sessionOverride = s) };
}

test("a crash mid-settlement is NOT recorded: Stripe's retry settles the buyer (never a 'duplicate' no-op)", async () => {
  const t = setup();
  t.store.crashOnInsert = 1;
  const event = ev("checkout.session.completed", session());
  await assert.rejects(processUnlockEvent(event, t.deps), /timed out/); // → the route answers 500
  assert.deepEqual(t.processed, [], "the event row was not written");
  assert.equal(t.store.unlocks.size, 0);
  assert.deepEqual(t.alerts.map((a) => a.kind), ["failure"], "the owner is told, with the session id");
  assert.equal((t.alerts[0] as { sessionId: string }).sessionId, "cs_test_1");

  await processUnlockEvent(event, t.deps); // Stripe's retry, same event id
  assert.equal(t.store.unlocks.get("A1")?.status, "paid");
  assert.deepEqual(t.processed, ["evt_1"], "recorded only now, after success");
  assert.deepEqual(t.alerts.map((a) => a.kind), ["failure", "paid"]);
});

test("replaying an already processed event is idempotent: no second unlock, no second 'paid' alert", async () => {
  const t = setup();
  const event = ev("checkout.session.completed", session());
  await processUnlockEvent(event, t.deps);
  await processUnlockEvent(event, t.deps);
  assert.equal(t.store.unlocks.size, 1);
  assert.equal(t.alerts.filter((a) => a.kind === "paid").length, 1);
  assert.equal(t.store.refunds.length, 0);
});

test("refund of a charge: a failing re-lock throws (retry) and is not recorded; success is recorded", async () => {
  const t = setup();
  t.failRelock(1);
  const event = ev("charge.refunded", { id: "ch_1", refunded: true, payment_intent: "pi_1" });
  await assert.rejects(processUnlockEvent(event, t.deps), /db down/);
  assert.deepEqual(t.processed, []);
  assert.equal(t.alerts[0].kind, "failure");
  await processUnlockEvent(event, t.deps);
  assert.deepEqual(t.relocks, ["pi_1"]);
  assert.deepEqual(t.processed, ["evt_1"]);
});

test("alerts: a wrong amount / duplicate payment is auto-refunded AND reported with its session id", async () => {
  const t = setup();
  t.useSession(session({ id: "cs_test_30", amount_total: 3000, amount_subtotal: 3000 }));
  await processUnlockEvent(ev("checkout.session.completed", session({ id: "cs_test_30" })), t.deps);
  assert.equal(t.store.unlocks.size, 0);
  assert.equal(t.store.refunds.length, 1);
  assert.deepEqual(t.alerts, [{ kind: "auto_refund", reason: "amount_mismatch", sessionId: "cs_test_30", analysisId: "A1" }]);
});

test("an alert that fails to send never breaks the settlement", async () => {
  const t = setup();
  t.deps.alert = async () => {
    throw new Error("resend down");
  };
  await processUnlockEvent(ev("checkout.session.completed", session()), t.deps);
  assert.equal(t.store.unlocks.get("A1")?.status, "paid");
  assert.deepEqual(t.processed, ["evt_1"]);
});

test("async events: failed is only recorded; succeeded settles like completed; plan sessions are not unlock events", async () => {
  const t = setup();
  await processUnlockEvent(ev(EV_ASYNC_FAILED, session()), t.deps);
  assert.equal(t.store.unlocks.size, 0);
  assert.deepEqual(t.processed, ["evt_1"]);
  await processUnlockEvent(ev(EV_ASYNC_OK, session(), "evt_2"), t.deps);
  assert.equal(t.store.unlocks.get("A1")?.status, "paid");
  assert.equal(isUnlockEvent(ev("checkout.session.completed", { mode: "subscription", metadata: { plan: "pro" } })), false);
  assert.equal(isUnlockEvent(ev("invoice.payment_succeeded", {})), false);
  assert.equal(isUnlockEvent(ev("charge.refunded", {})), true);
});

test("owner alert content: domain, amount, currency and the session id", () => {
  const paid = buildUnlockAlert({ kind: "paid", sessionId: "cs_live_9", analysisId: "A1", amount: 645, currency: "eur" }, "shop.example.com");
  assert.match(paid.subject, /shop\.example\.com/);
  assert.match(paid.subject, /6\.45 EUR/);
  assert.ok(paid.lines.some((l) => l.includes("cs_live_9")));
  const fail = buildUnlockAlert({ kind: "failure", stage: "settle", sessionId: "cs_live_9", error: "boom", eventId: "evt_9" }, null);
  assert.match(fail.subject, /FAILED — cs_live_9/);
  assert.ok(fail.lines.some((l) => l.includes("boom")));
  const ref = buildUnlockAlert({ kind: "auto_refund", reason: "duplicate_refunded", sessionId: "cs_test_2", analysisId: "A1" }, "x.com");
  assert.match(ref.subject, /auto-refunded/);
  assert.ok(ref.lines.some((l) => l.includes("dashboard.stripe.com/test")), "test sessions link to the test dashboard");
});

test("webhook: unlock events skip the pre-insert dedupe; the generic path no longer handles them", () => {
  const w = read("app/api/stripe/webhook/route.ts");
  const unlockAt = w.indexOf("if (isUnlockEvent(event))");
  const dedupeAt = w.indexOf("// ── Idempotency");
  assert.ok(unlockAt > 0 && dedupeAt > unlockAt, "the unlock path runs BEFORE the dedupe insert");
  assert.doesNotMatch(w, /unlockRelated|settleReportUnlock|onChargeRefunded/);
  assert.match(w, /alert: sendUnlockAlert/);
});

test("return page: a completed-but-unpaid session is 'processing', never 'nothing was charged'", () => {
  const page = read("app/(app)/app/unlock/return/page.tsx");
  assert.match(page, /payment_status === "unpaid"\) \{[\s\S]*?pending = true;/);
  assert.match(page, /canceled \|\| \(!paid && !pending\)/);
  assert.match(page, /pending=\{pending\}/);
  for (const locale of ["en", "es"] as const) {
    const u = (messages[locale] as unknown as { unlock: Record<string, string> }).unlock;
    assert.ok(u.pendingTitle && u.pendingSub, `${locale} copy`);
    assert.doesNotMatch(u.pendingTitle, /no se cobr|nothing was charged/i);
  }
});

test("disputes are recorded as known debt", () => {
  assert.match(read("docs/infra-debt.md"), /charge\.dispute/);
});
