import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reportUnlockEnabled, reportUnlockEnabledFor, REPORT_UNLOCK_TEST_EMAILS } from "../../lib/flags";
import { isUnlockSession, summarizeUnlocks } from "../../lib/admin/money";
import { FAQ_ITEMS } from "../../lib/content/faq";

/** WP-5 (measurement, owner monitor) + WP-6 (legal/FAQ) + the production test list, all behind REPORT_UNLOCK. */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.REPORT_UNLOCK;
  if (value === undefined) delete process.env.REPORT_UNLOCK;
  else process.env.REPORT_UNLOCK = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.REPORT_UNLOCK;
    else process.env.REPORT_UNLOCK = prev;
  }
}

test("production test list: with the global flag OFF only the owner's email gets the unlock", () => {
  withFlag(undefined, () => {
    assert.equal(reportUnlockEnabled(), false);
    assert.deepEqual([...REPORT_UNLOCK_TEST_EMAILS], ["aresjinwoo94@gmail.com", "ariesskuri@gmail.com"]);
    assert.equal(reportUnlockEnabledFor("ariesskuri@gmail.com"), true);
    assert.equal(reportUnlockEnabledFor("aresjinwoo94@gmail.com"), true);
    assert.equal(reportUnlockEnabledFor("  AresJinwoo94@Gmail.com "), true, "case/space insensitive");
    assert.equal(reportUnlockEnabledFor("someone@else.com"), false);
    assert.equal(reportUnlockEnabledFor("aresjinwoo94@gmail.com.evil.io"), false, "exact match, not a prefix");
    assert.equal(reportUnlockEnabledFor(null), false, "anonymous viewers have no email");
    assert.equal(reportUnlockEnabledFor(undefined), false);
    assert.equal(reportUnlockEnabledFor(""), false);
  });
});

test("global flag ON: everybody; the list is not needed", () => {
  withFlag("true", () => {
    assert.equal(reportUnlockEnabledFor("someone@else.com"), true);
    assert.equal(reportUnlockEnabledFor(null), true);
  });
});

test("every server path that decides the viewer's report/offer is keyed by the viewer's email", () => {
  for (const f of [
    "app/(app)/app/analyzer/[id]/page.tsx",
    "app/api/analyses/[id]/route.ts",
    "app/api/analyses/[id]/growth-map/route.ts",
    "app/api/analyses/[id]/fix-tracks/[track]/route.ts",
  ]) {
    assert.match(read(f), /resolveFullReport\(\{[^}]*email: user\.email/, `${f} passes the email`);
  }
  assert.match(read("app/(app)/app/analyzer/[id]/page.tsx"), /unlockOffer: reportUnlockEnabledFor\(user\.email\)/);
  assert.match(read("app/(app)/app/unlock/[analysisId]/page.tsx"), /!reportUnlockEnabledFor\(user\.email\)\) notFound\(\)/);
  assert.match(read("app/actions/meta-simulator.ts"), /unlockedProjectionAllowed\(user\.id, parsed\.data\.analysisId, user\.email\)/);
  assert.match(read("lib/unlocks/entitlement.ts"), /reportUnlockEnabledFor\(p\.email\)/);
  // anonymous pages keep the GLOBAL flag only (no email to match)
  assert.match(read("app/audit/[id]/page.tsx"), /unlockOffer: reportUnlockEnabled\(\)/);
});

test("the webhook settles unlocks regardless of the flag (a payment is always honoured)", () => {
  const w = read("app/api/stripe/webhook/route.ts");
  assert.doesNotMatch(w, /reportUnlockEnabled/);
});

test("owner monitor: unlock sessions are separated from plan checkouts, 'casi pagan' and revenue-per-subscription", () => {
  assert.equal(isUnlockSession({ metadata: { purchase: "report_unlock" } }), true);
  assert.equal(isUnlockSession({ metadata: { supabase_user_id: "u", plan: "pro" } }), false);
  assert.equal(isUnlockSession({ metadata: null }), false);
  const m = read("lib/admin/metrics.ts");
  assert.match(m, /if \(isUnlockSession\(s\)\) \{\s*unlockCreated\+\+;/, "checkoutStats counts them apart");
  assert.match(m, /if \(isUnlockSession\(s\)\) continue;/, "not an 'almost subscriber'");
  assert.match(m, /Math\.max\(0, revenue - unlocks\.grossUsd\) \/ orders/, "unlock money is not subscription revenue");
  assert.match(m, /unlocks: \{ count: unlocks\.paid/);
  assert.match(read("components/admin/owner-monitor.tsx"), /Desbloqueos \(\$7, pago único\)/);
});

test("unlock summary: count × price, refunds netted, gross keeps the charge", () => {
  const s = summarizeUnlocks([{ status: "paid" }, { status: "paid" }, { status: "refunded" }], 700);
  assert.deepEqual(s, { charged: 3, refunded: 1, paid: 2, grossUsd: 21, netUsd: 14 });
  assert.deepEqual(summarizeUnlocks([], 700), { charged: 0, refunded: 0, paid: 0, grossUsd: 0, netUsd: 0 });
});

test("WP-6: the unlock appears in legal/FAQ/llms.txt only while it is on sale, and never as a plan", () => {
  withFlag(undefined, () => {
    assert.ok(!FAQ_ITEMS.some((f) => /one report/i.test(f.q)), "flag off: no FAQ entry");
  });
  const refunds = read("app/legal/refunds/page.tsx");
  assert.match(refunds, /\{unlock && \(/);
  assert.match(refunds, /within 7 days/);
  assert.match(refunds, /locks again/);
  assert.match(refunds, /"subscription payments are" : "payments are"/, "the wording changes only while the unlock is on sale");
  assert.match(read("app/legal/terms/page.tsx"), /reportUnlockEnabled\(\) && \(/);
  assert.match(read("app/llms.txt/route.ts"), /reportUnlockEnabled\(\) \?/);
  assert.match(read("lib/content/faq.ts"), /Can I pay for just one report\?/);
  assert.doesNotMatch(read("lib/stripe/plans.ts"), /one-time|report unlock|US$7/i, "PLANS never mentions the unlock");
  assert.doesNotMatch(read("components/marketing/pricing.tsx"), /one-time|report unlock|US$7/i, "no unlock in the plan table");
});
