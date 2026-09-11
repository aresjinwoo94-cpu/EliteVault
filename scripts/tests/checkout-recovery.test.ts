import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideRecoveryAction,
  summarizeSiblingSequences,
  SEQUENCE_WINDOW_MS,
  type RecoveryState,
} from "../../lib/checkout/recovery-logic";
import { buildAbandonedCheckout } from "../../lib/email/abandoned-checkout";

/**
 * Abandoned-checkout recovery. These cover the two things the brief's
 * acceptance criteria call out: the sequence must STOP the moment the user
 * converts (paid plan or active/trialing sub) or unsubscribes, and the email
 * builder must produce a valid recovery email per step.
 */

const PENDING: RecoveryState = {
  currentPlan: "free",
  hasActiveSubscription: false,
  rowStatus: "pending",
  emailsSent: 0,
  supersededByOlderSequence: false,
  unsubscribedElsewhere: false,
};

test("step 1 sends when the user is still on Free and hasn't been emailed", () => {
  const d = decideRecoveryAction(PENDING, 1);
  assert.equal(d.action, "send");
});

test("conversion BETWEEN step 1 and step 2 stops the sequence (paid plan)", () => {
  // After step 1 was sent (emails_sent = 1) the user upgrades → plan != free.
  const converted: RecoveryState = {
    ...PENDING,
    currentPlan: "pro",
    emailsSent: 1,
  };
  const d = decideRecoveryAction(converted, 2);
  assert.equal(d.action, "stop");
  assert.equal(d.action === "stop" && d.recovered, true);
  assert.equal(d.reason, "recovered_plan");
});

test("an active subscription stops the sequence even if plan still reads free", () => {
  const d = decideRecoveryAction(
    { ...PENDING, hasActiveSubscription: true, emailsSent: 1 },
    2,
  );
  assert.equal(d.action, "stop");
  assert.equal(d.action === "stop" && d.recovered, true);
  assert.equal(d.reason, "recovered_subscription");
});

test("unsubscribe stops the sequence and is NOT counted as recovered", () => {
  const d = decideRecoveryAction({ ...PENDING, rowStatus: "unsubscribed" }, 2);
  assert.equal(d.action, "stop");
  assert.equal(d.action === "stop" && d.recovered, false);
  assert.equal(d.reason, "unsubscribed");
});

test("a step already sent is skipped (idempotent) but the sequence continues", () => {
  // emails_sent already at 2 → step 2 must not resend, but must not stop either.
  const d = decideRecoveryAction({ ...PENDING, emailsSent: 2 }, 2);
  assert.equal(d.action, "skip");
});

test("a missing row stops the sequence safely", () => {
  const d = decideRecoveryAction({ ...PENDING, rowStatus: null }, 1);
  assert.equal(d.action, "stop");
  assert.equal(d.action === "stop" && d.recovered, false);
});

// ── Send-time dedupe across a user's sequences ──────────────────────────────

test("a sequence superseded by an older one stops without counting as recovered", () => {
  const d = decideRecoveryAction(
    { ...PENDING, emailsSent: 2, supersededByOlderSequence: true },
    3,
  );
  assert.equal(d.action, "stop");
  assert.equal(d.action === "stop" && d.recovered, false);
  assert.equal(d.reason, "superseded");
});

test("an unsubscribe on a sibling sequence stops this one too", () => {
  const d = decideRecoveryAction({ ...PENDING, unsubscribedElsewhere: true }, 1);
  assert.equal(d.action, "stop");
  assert.equal(d.reason, "unsubscribed");
});

test("conversion still wins over superseded (the row gets marked recovered)", () => {
  const d = decideRecoveryAction(
    { ...PENDING, currentPlan: "pro", supersededByOlderSequence: true },
    2,
  );
  assert.equal(d.action === "stop" && d.recovered, true);
});

const iso = (ms: number) => new Date(ms).toISOString();
const T0 = Date.parse("2026-09-09T00:54:47.763Z");

test("the newer of two overlapping sequences is superseded; the older keeps sending", () => {
  const older = { session_id: "cs_a", status: "pending", created_at: iso(T0) };
  const newer = { session_id: "cs_b", status: "pending", created_at: iso(T0 + 23 * 60_000) };

  const forNewer = summarizeSiblingSequences(
    { sessionId: newer.session_id, createdAt: newer.created_at },
    [older],
  );
  const forOlder = summarizeSiblingSequences(
    { sessionId: older.session_id, createdAt: older.created_at },
    [newer],
  );
  assert.equal(forNewer.supersededByOlderSequence, true);
  assert.equal(forOlder.supersededByOlderSequence, false);
});

test("an older sequence outside the 72h window does not supersede a new one", () => {
  const stale = {
    session_id: "cs_old",
    status: "pending", // finished sequences stay 'pending' forever
    created_at: iso(T0 - SEQUENCE_WINDOW_MS - 1),
  };
  const s = summarizeSiblingSequences({ sessionId: "cs_new", createdAt: iso(T0) }, [stale]);
  assert.equal(s.supersededByOlderSequence, false);
});

test("the verdict is anchored to created_at, so it can't flip at step 3 (72h later)", () => {
  // Older started 10 min before; at step 3 'now' is >72h after the older one,
  // but the comparison never uses 'now'.
  const s = summarizeSiblingSequences(
    { sessionId: "cs_b", createdAt: iso(T0 + 10 * 60_000) },
    [{ session_id: "cs_a", status: "pending", created_at: iso(T0) }],
  );
  assert.equal(s.supersededByOlderSequence, true);
});

test("identical created_at: exactly one of the pair survives (session_id tie-break)", () => {
  const at = iso(T0);
  const a = summarizeSiblingSequences({ sessionId: "cs_a", createdAt: at }, [
    { session_id: "cs_b", status: "pending", created_at: at },
  ]);
  const b = summarizeSiblingSequences({ sessionId: "cs_b", createdAt: at }, [
    { session_id: "cs_a", status: "pending", created_at: at },
  ]);
  assert.equal(a.supersededByOlderSequence !== b.supersededByOlderSequence, true);
});

test("own row is ignored and an unsubscribed sibling is flagged", () => {
  const s = summarizeSiblingSequences({ sessionId: "cs_me", createdAt: iso(T0) }, [
    { session_id: "cs_me", status: "unsubscribed", created_at: iso(T0 - 1000) },
    { session_id: "cs_x", status: "unsubscribed", created_at: iso(T0 - SEQUENCE_WINDOW_MS * 5) },
  ]);
  assert.equal(s.supersededByOlderSequence, false);
  assert.equal(s.unsubscribedElsewhere, true);
});

test("parses Postgres microsecond timestamps (the shape PostgREST returns)", () => {
  // Real prod shape: a chain where the user already finished a sequence the
  // day before, then opened two more 23 min apart — both later ones stop.
  const rows = [
    { session_id: "cs_1", status: "pending", created_at: "2026-09-08T00:19:50.777731+00:00" },
    { session_id: "cs_2", status: "pending", created_at: "2026-09-09T00:54:47.763435+00:00" },
    { session_id: "cs_3", status: "pending", created_at: "2026-09-09T01:17:05.112102+00:00" },
  ];
  const verdict = (id: string) =>
    summarizeSiblingSequences(
      { sessionId: id, createdAt: rows.find((r) => r.session_id === id)!.created_at },
      rows,
    ).supersededByOlderSequence;
  assert.equal(verdict("cs_1"), false);
  assert.equal(verdict("cs_2"), true);
  assert.equal(verdict("cs_3"), true);
});

test("email builder produces a valid recovery email for every step", () => {
  for (const step of [1, 2, 3] as const) {
    const { subject, html } = buildAbandonedCheckout({
      plan: "pro",
      price: 19,
      interval: "month",
      recoveryUrl: "https://elitevaultapp.com/app/checkout?plan=pro&interval=month",
      unsubscribeUrl: "https://elitevaultapp.com/api/email/unsubscribe?sid=cs_1&t=abc",
      step,
      appUrl: "https://elitevaultapp.com",
    });
    assert.ok(subject.length > 0, `step ${step} has a subject`);
    assert.match(html, /Complete my Pro upgrade/);
    assert.ok(
      html.includes("/app/checkout?plan=pro&interval=month"),
      `step ${step} links the recovery URL`,
    );
    assert.ok(
      html.includes("/api/email/unsubscribe?sid=cs_1"),
      `step ${step} includes a working unsubscribe link`,
    );
  }
});

test("step 3 is short — it drops the feature/price detail block", () => {
  const opts = {
    plan: "scale" as const,
    price: 29,
    interval: "month" as const,
    recoveryUrl: "https://x/app/checkout?plan=scale&interval=month",
    unsubscribeUrl: "https://x/api/email/unsubscribe?sid=cs_1&t=abc",
    appUrl: "https://x",
  };
  const s1 = buildAbandonedCheckout({ ...opts, step: 1 });
  const s3 = buildAbandonedCheckout({ ...opts, step: 3 });
  assert.ok(s1.html.includes("WHAT SCALE UNLOCKS"));
  assert.ok(!s3.html.includes("WHAT SCALE UNLOCKS"));
});

const BASE_OPTS = {
  plan: "pro" as const,
  recoveryUrl: "https://x/app/checkout?plan=pro&interval=year",
  unsubscribeUrl: "https://x/api/email/unsubscribe?sid=cs_1&t=abc",
  appUrl: "https://x",
  step: 1 as const,
};

test("an annual checkout is priced per year, never '/mo'", () => {
  const { html, text } = buildAbandonedCheckout({
    ...BASE_OPTS,
    price: 180,
    interval: "year",
  });
  assert.ok(html.includes("$180/yr"));
  assert.ok(text.includes("$180/yr"));
  assert.ok(!html.includes("/mo"));
  assert.ok(!text.includes("/mo"));
});

test("email uses the sign-in brand palette and Outlook-safe markup", () => {
  const { html } = buildAbandonedCheckout({
    ...BASE_OPTS,
    price: 19,
    interval: "month",
  });
  assert.ok(html.includes("#2DD4BF"), "brand teal");
  assert.ok(html.includes("#06060a") && html.includes("#0a0a0f"), "brand blacks");
  assert.ok(!/#5AE7D0|#070D0B|#0B1512/i.test(html), "no legacy green palette");
  assert.ok(html.includes('<meta name="color-scheme" content="dark" />'));
  assert.ok(html.includes('<meta name="supported-color-schemes" content="dark" />'));
  assert.ok(!html.includes("transform"), "no CSS transform on the logo");
  assert.ok(html.includes("<v:roundrect"), "VML button fallback for Outlook");
  assert.ok(html.includes('width="520"'), "fixed card width for Outlook");
});
