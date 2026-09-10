import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideRecoveryAction,
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
