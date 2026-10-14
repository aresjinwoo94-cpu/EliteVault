import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";

/** WP-4 (brief oct-2026 §6): inline card + click-only modal, behind REPORT_UNLOCK. */
const ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const run = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", "--tsconfig", "scripts/tests/tsconfig.json", "scripts/tests/helpers/render-unlock-offer.mts"],
  { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", timeout: 120_000, maxBuffer: 20 * 1024 * 1024 },
);
const raw = run.stdout.split("@@JSON@@")[1];
if (!raw) throw new Error(`render helper failed (status ${run.status}): ${run.stderr.slice(0, 800)}`);
const HTML = JSON.parse(raw) as Record<string, { fixes: string; cure: string }>;

for (const locale of ["en", "es"] as const) {
  const u = (messages[locale] as unknown as { unlock: Record<string, string> }).unlock;

  test(`[${locale}] flag off: the report is byte-identical (no provider ≡ provider disabled), no card, no unlock copy`, () => {
    assert.equal(HTML[`${locale}:disabled`].fixes, HTML[`${locale}:off`].fixes);
    assert.equal(HTML[`${locale}:disabled`].cure, HTML[`${locale}:off`].cure);
    assert.ok(!HTML[`${locale}:off`].fixes.includes("data-unlock-card"));
    assert.ok(HTML[`${locale}:off`].fixes.includes("checkout?plan=pro"), "the Pro upsell is still the only offer");
    assert.ok(!HTML[`${locale}:off`].cure.includes(u.lockedTitle));
  });

  test(`[${locale}] flag on: the card sits under the locked fixes with the price line and a plain link to /app/unlock`, () => {
    const h = HTML[`${locale}:on`].fixes;
    assert.ok(h.includes("data-unlock-card"));
    assert.ok(h.includes(u.cardPrice), "US$7 · one-time · no subscription");
    assert.ok(h.includes(u.cardTitleMany.replace("{n}", "2")));
    assert.ok(h.includes('href="/app/unlock/a1"'), "the main action is a link, not a pop-up");
    assert.ok(h.includes("/app/checkout?plan=pro&amp;interval=month"), "Pro stays as the secondary line");
    // nothing opens by itself: no dialog markup in the server render
    assert.ok(!h.includes('role="dialog"'));
  });

  test(`[${locale}] flag on: locked rows are buttons that open the modal; the open row is not`, () => {
    const h = HTML[`${locale}:on`].fixes;
    assert.equal((h.match(/role="button"/g) ?? []).length, 2, "fixes #2 and #3");
    assert.ok(!HTML[`${locale}:off`].fixes.includes('role="button"'));
  });

  test(`[${locale}] flag on: the persona lock offers the unlock (modal) instead of only Pro`, () => {
    const c = HTML[`${locale}:on`].cure;
    assert.ok(c.includes(u.lockedTitle));
    assert.ok(c.includes(u.cardCta));
    assert.ok(!c.includes("checkout?plan=pro"), "no Pro link competing with the main action");
  });

  test(`[${locale}] anonymous: the card CTA goes through sign-up first, never straight to checkout`, () => {
    const h = HTML[`${locale}:anon`].fixes;
    assert.ok(h.includes(`href="/sign-up?next=${encodeURIComponent("/app/unlock/a1")}"`));
    assert.ok(h.includes(u.cardCtaAnon));
    assert.ok(!h.includes('href="/app/unlock/a1"'));
  });
}

test("the modal is click-only: no timers, scroll or exit-intent triggers in the unlock offer; the paywall modals stand down", () => {
  const src = read("components/analyzer/unlock-offer.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const offerPart = src.slice(0, src.indexOf("export function UnlockNotices"));
  assert.doesNotMatch(offerPart, /setTimeout|setInterval|addEventListener|IntersectionObserver|mouseleave|scroll/i);
  assert.match(offerPart, /setSource\(s\)/);
  assert.match(offerPart, /if \(s !== "card"\)/);
  const view = read("components/analyzer/analysis-view.tsx");
  assert.match(view, /!unlockOn && \/\/ D2/, "AnalyzerPaywall (scroll recap / exit intent) is off while the unlock offer is on");
  assert.match(view, /const unlockOn = \(viewer\.unlockOffer \?\? false\) && !fullReportNow && isDone && !captureBlocked\.blocked;/);
});

test("the offer exists only behind the flag, and only for viewers without the full report", () => {
  assert.match(read("app/(app)/app/analyzer/[id]/page.tsx"), /unlockOffer: reportUnlockEnabled\(\)/);
  assert.match(read("app/audit/[id]/page.tsx"), /unlockOffer: reportUnlockEnabled\(\)/);
  assert.match(read("components/analyzer/analysis-view.tsx"), /UnlockOfferProvider enabled=\{unlockOn\}/);
});

test("funnel events of the brief (§7.1) are all emitted", () => {
  const offer = read("components/analyzer/unlock-offer.tsx");
  for (const ev of ["report_locked_viewed", "unlock_cta_click", "unlock_modal_opened", "unlock_pro_link_click"]) assert.match(offer, new RegExp(`"${ev}"`));
  assert.match(read("components/billing/embedded-checkout.tsx"), /"unlock_checkout_viewed"/);
  assert.match(read("components/billing/unlock-return.tsx"), /"unlock_paid"/);
  assert.match(read("lib/analytics/audit-events.ts"), /"audit_started"/);
});

test("the unlocked Free viewer gets ONE projection per report, enforced on the server", () => {
  const sim = read("lib/unlocks/simulation.ts");
  assert.match(sim, /UNLOCK_PROJECTIONS_PER_REPORT = 1/);
  assert.match(sim, /\.in\("status", \["queued", "running", "succeeded"\]\)/, "a failed run does not burn it");
  const act = read("app/actions/meta-simulator.ts");
  assert.match(act, /unlockedProjectionAllowed\(user\.id, parsed\.data\.analysisId\)/);
  assert.match(act, /keepRunWithinAllowance\(/);
  assert.doesNotMatch(read("lib/quota/guard.ts"), /unlock/i, "assertQuota (plan quotas) is untouched");
  assert.match(read("app/(app)/app/analyzer/[id]/page.tsx"), /const canRunMeta = \(plan\.quotas\.metaRunsPerMonth \?\? 1\) !== 0 \|\| unlockedFree;/);
});
