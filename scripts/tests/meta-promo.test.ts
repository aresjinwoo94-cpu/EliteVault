import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzerMetaPromoEnabled } from "../../lib/flags";
import { toClientAnalysis, gateMetaAds } from "../../lib/analyzer/client-payload";
import { PLANS } from "../../lib/stripe/plans";
import {
  metaPromoTier,
  metaPromoCta,
  metaPromoMovesSectionUp,
  META_PROMO_EVENTS,
  META_PROMO_SAMPLE,
} from "../../lib/analyzer/meta-promo";
import { messages } from "../../lib/i18n/messages";

/**
 * WP-4 (docs/analyzer-mejora-definitiva.md §3/§7) — promote the Meta Campaign
 * Simulator, behind ANALYZER_META_PROMO.
 *
 * Two different things are pinned here:
 *   1. The promo itself (flag, audience tiers, CTAs, instrumentation).
 *   2. The server-side gate. A locked preview is only honest if the real data
 *      is NOT in the page payload. The Library once shipped real metrics to
 *      Free clients and blurred them in CSS ("the Library paywall was
 *      cosmetic"); this is the same rule applied to the report.
 */

const ROOT = process.cwd();
const code = (p: string) =>
  readFileSync(resolve(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ─── Flag ───────────────────────────────────────────────────────────────────

// The promo ships ON (brief §3). The flag stays, so it can be switched off in
// the environment without a deploy — that kill switch is what makes shipping
// it on safe, so it is pinned as hard as the default itself.
test("ANALYZER_META_PROMO defaults ON, and the env kill switch still works", () => {
  const prev = process.env.ANALYZER_META_PROMO;
  try {
    delete process.env.ANALYZER_META_PROMO;
    assert.equal(analyzerMetaPromoEnabled(), true, "unset = on");
    process.env.ANALYZER_META_PROMO = "";
    assert.equal(analyzerMetaPromoEnabled(), true, "blank = unset");
    for (const off of ["false", "0", "off", "no"]) {
      process.env.ANALYZER_META_PROMO = off;
      assert.equal(analyzerMetaPromoEnabled(), false, off);
    }
    for (const on of ["true", "1", "on", "yes"]) {
      process.env.ANALYZER_META_PROMO = on;
      assert.equal(analyzerMetaPromoEnabled(), true, on);
    }
    assert.match(code("lib/flags.ts"), /enabled\("ANALYZER_META_PROMO",\s*true\)/);
  } finally {
    if (prev === undefined) delete process.env.ANALYZER_META_PROMO;
    else process.env.ANALYZER_META_PROMO = prev;
  }
});

// ─── Server-side gate ───────────────────────────────────────────────────────

const ROW = {
  id: "a1",
  status: "succeeded",
  result: { score: 61 },
  meta_ads: { targets: { cpc: 1.4 }, niche: "skincare" },
  niche_winners: {
    result: { winners: [{ domain: "rival.com", revenue: { low: 90000, high: 140000 }, activeAds: 42 }] },
  },
};

test("the stored niche winners (real stores + revenue) NEVER reach the client, for any plan", () => {
  for (const canRunMeta of [false, true]) {
    const out = toClientAnalysis(ROW, { canRunMeta }) as Record<string, unknown>;
    assert.equal("niche_winners" in out, false, `canRunMeta=${canRunMeta}`);
    assert.doesNotMatch(JSON.stringify(out), /rival\.com|140000/);
  }
});

// The Meta run writes meta_ads for Pro and Scale and the report renders it for
// viewers who can run Meta — that is unchanged. Everyone else (anonymous, Free,
// a paid user who downgraded) must not receive it.
test("the Meta Ads Optimizer payload reaches the client only for viewers who can run Meta", () => {
  assert.equal((toClientAnalysis(ROW, { canRunMeta: false }) as { meta_ads: unknown }).meta_ads, null);
  assert.deepEqual((toClientAnalysis(ROW, { canRunMeta: true }) as { meta_ads: unknown }).meta_ads, ROW.meta_ads);
  assert.equal((toClientAnalysis({ ...ROW, meta_ads: undefined }, { canRunMeta: true }) as { meta_ads: unknown }).meta_ads, null);
});

test("the gate keeps everything else and does not mutate the row", () => {
  const snapshot = JSON.stringify(ROW);
  const out = toClientAnalysis(ROW, { canRunMeta: false }) as Record<string, unknown>;
  assert.equal(out.id, "a1");
  assert.equal(out.status, "succeeded");
  assert.deepEqual(out.result, { score: 61 });
  assert.equal(JSON.stringify(ROW), snapshot, "input must not be mutated");
});

test("the polling endpoint's gate follows the same rule, failing closed", () => {
  assert.equal(gateMetaAds({ meta_ads: { x: 1 } }, false).meta_ads, null);
  assert.deepEqual(gateMetaAds({ meta_ads: { x: 1 } }, true).meta_ads, { x: 1 });
  // Plans that can run Meta — the same quota check the report page uses.
  const canRun = (k: keyof typeof PLANS) => (PLANS[k].quotas.metaRunsPerMonth ?? 1) !== 0;
  assert.equal(canRun("free"), false);
  assert.equal(canRun("pro"), true);
  assert.equal(canRun("scale"), true);
  assert.match(
    code("app/api/analyses/[id]/route.ts"),
    /plan != null && \(plan\.quotas\.metaRunsPerMonth \?\? 1\) !== 0/,
    "an unknown or missing plan must fail closed",
  );
});

test("every page and endpoint that hands an analysis to the client goes through the gate", () => {
  const owned = code("app/(app)/app/analyzer/[id]/page.tsx");
  // The pages cast the row for AnalysisView's hand-written type (as they did
  // before); what matters is that the gate is what gets passed.
  assert.match(
    owned,
    /initial=\{toClientAnalysis\(analysis,\s*\{\s*canRunMeta\s*\}\)(\s+as\s+\w+)?\}/,
  );
  const anon = code("app/audit/[id]/page.tsx");
  assert.match(anon, /initial=\{toClientAnalysis\(row,\s*\{\s*canRunMeta:\s*false\s*\}\)(\s+as\s+\w+)?\}/);
  const preview = code("app/preview/anon-audit/page.tsx");
  assert.match(preview, /toClientAnalysis\(row,\s*\{\s*canRunMeta:\s*false\s*\}\)/);
  const poll = code("app/api/analyses/[id]/route.ts");
  assert.match(poll, /gateMetaAds\(/);

  // And no page hands AnalysisView a raw row any more.
  for (const f of ["app/(app)/app/analyzer/[id]/page.tsx", "app/audit/[id]/page.tsx", "app/preview/anon-audit/page.tsx"]) {
    assert.doesNotMatch(code(f), /initial=\{\s*(row|analysis)\b(?!\s*,)/, `${f} passes a raw row`);
  }
});

// ─── Promo logic ────────────────────────────────────────────────────────────

const v = (o: Partial<{ isAnon: boolean; isPaid: boolean; isScale: boolean; canRunMeta: boolean }>) => ({
  isAnon: false,
  isPaid: false,
  isScale: false,
  canRunMeta: false,
  ...o,
});

test("audience tiers: anonymous, free, Pro (can run), Scale", () => {
  assert.equal(metaPromoTier(v({ isAnon: true })), "anon");
  assert.equal(metaPromoTier(v({})), "free");
  assert.equal(metaPromoTier(v({ isPaid: true, canRunMeta: true })), "pro");
  assert.equal(metaPromoTier(v({ isPaid: true, canRunMeta: true, isScale: true })), "scale");
  // Anonymous is never promoted as a runner, whatever else is set.
  assert.equal(metaPromoTier(v({ isAnon: true, isPaid: true, canRunMeta: true, isScale: true })), "anon");
});

test("CTAs: locked tiers upgrade to Pro; runners jump to their simulator", () => {
  const anon = metaPromoCta("anon");
  assert.equal(anon.kind, "upgrade");
  // Same door as the register gate: /app/analyzer claims the anonymous audit
  // into the new account. Going straight to checkout would orphan it.
  assert.equal(anon.kind === "upgrade" ? anon.href : "", "/sign-up?next=/app/analyzer");
  assert.match(code("components/analyzer/anon-register-gate.tsx"), /"\/sign-up\?next=\/app\/analyzer"/);

  const free = metaPromoCta("free");
  assert.deepEqual(free, { kind: "upgrade", href: "/app/checkout?plan=pro&interval=month", targetPlan: "pro" });

  assert.equal(metaPromoCta("pro").kind, "run");
  assert.equal(metaPromoCta("scale").kind, "run");
});

test("audience order: the simulator moves up only for plans that already pay for it", () => {
  assert.equal(metaPromoMovesSectionUp("scale"), true);
  assert.equal(metaPromoMovesSectionUp("pro"), true);
  assert.equal(metaPromoMovesSectionUp("free"), false, "free keeps narrative → wall");
  assert.equal(metaPromoMovesSectionUp("anon"), false);
});

test("the locked preview is a frozen, static example — no per-audit numbers", () => {
  assert.ok(Object.isFrozen(META_PROMO_SAMPLE));
  assert.equal(META_PROMO_SAMPLE.length, 3);
  for (const s of META_PROMO_SAMPLE) assert.ok(Object.isFrozen(s));
});

test("the promo components take no analysis data at all", () => {
  const ui = code("components/analyzer/meta-promo.tsx");
  assert.doesNotMatch(
    ui,
    /\b(meta_ads|niche_winners|initialSimulation|result|scenarios|score)\b/,
    "the promo must render from tier + static sample only",
  );
});

test("instrumentation: view, upgrade click and run-simulator click are all captured", () => {
  assert.deepEqual({ ...META_PROMO_EVENTS }, {
    view: "meta_promo_view",
    upgradeClick: "meta_promo_upgrade_click",
    runClick: "meta_promo_run_simulator_click",
  });
  const ui = code("components/analyzer/meta-promo.tsx");
  for (const k of ["view", "upgradeClick", "runClick"]) {
    assert.match(ui, new RegExp(`META_PROMO_EVENTS\\.${k}\\b`), k);
  }
});

test("the report only renders the promo when the flag is on", () => {
  const view = code("components/analyzer/analysis-view.tsx");
  assert.match(view, /viewer\.metaPromo/);
  for (const c of ["MetaSimulatorTeaser", "MetaPromoRail", "MetaPromoMobileBar"]) {
    assert.match(view, new RegExp(`<${c}\\b`), c);
  }
  assert.match(code("app/(app)/app/analyzer/[id]/page.tsx"), /metaPromo:\s*analyzerMetaPromoEnabled\(\)/);
  assert.match(code("app/audit/[id]/page.tsx"), /metaPromo:\s*analyzerMetaPromoEnabled\(\)/);
});

// ─── Copy ───────────────────────────────────────────────────────────────────

const KEYS = [
  "eyebrow",
  "teaserTitle",
  "teaserBody",
  "sampleLabel",
  "roasLabel",
  "conservative",
  "balanced",
  "aggressive",
  "unlockPro",
  "signupCta",
  "runCta",
  "optimizerUpsell",
  "optimizerCta",
  "railTitle",
  "mobileLocked",
  "mobileRun",
  "cancelAnytime",
];

test("the unlock price comes from PLANS, not a hard-coded number", () => {
  for (const locale of ["en", "es"] as const) {
    const s = (messages[locale] as unknown as { metaPromo: { unlockPro: string } }).metaPromo.unlockPro;
    assert.match(s, /\{price\}/, locale);
    assert.doesNotMatch(s, /\d/, locale);
  }
  assert.match(
    code("components/analyzer/meta-promo.tsx"),
    /replace\("\{price\}",\s*String\(PLANS\.pro\.price\.month\)\)/,
  );
});

test("promo copy exists in both locales", () => {
  for (const locale of ["en", "es"] as const) {
    const ns = (messages[locale] as Record<string, Record<string, unknown>>).metaPromo;
    assert.ok(ns, `[${locale}] missing metaPromo namespace`);
    for (const k of KEYS) {
      assert.equal(typeof ns[k], "string", `[${locale}] metaPromo.${k}`);
      assert.ok((ns[k] as string).length > 0, `[${locale}] metaPromo.${k} empty`);
    }
  }
});

// Shipping the promo ON made two layout rules load-bearing rather than cosmetic.
test("the rail and the bottom bar are mutually exclusive, with room left for the bar", () => {
  const view = code("components/analyzer/analysis-view.tsx");
  // The app shell already spends 16rem on its sidebar, so the rail waits for
  // 2xl there; the anonymous report has the full width and gets it at xl.
  assert.match(view, /railAt:\s*"xl"\s*\|\s*"2xl"\s*=\s*isAnon\s*\?\s*"xl"\s*:\s*"2xl"/);
  // Mapped the right way round: railAt "xl" must not render the 2xl classes.
  assert.match(
    view,
    /railAt === "xl"\s*\?\s*"hidden xl:block[^"]*"\s*:\s*"hidden 2xl:block[^"]*"/,
  );
  assert.match(
    view,
    /railAt === "xl"\s*\?\s*"xl:grid[^"]*"\s*:\s*"2xl:grid[^"]*"/,
  );
  // The bar hides exactly where the rail appears — never both, never neither.
  assert.match(view, /hideAt=\{railAt\}/);
  const bar = code("components/analyzer/meta-promo.tsx");
  assert.match(bar, /hideAt === "xl" \? "xl:hidden" : "2xl:hidden"/);

  // `md:p-8` also sets padding-bottom and wins over a bare `pb-28`, so the
  // clearance must be restated at md or the bar covers the report's end
  // between md and the rail's breakpoint.
  for (const cls of ["pb-28 md:pb-28 xl:pb-8", "pb-28 md:pb-28 2xl:pb-8"]) {
    assert.ok(view.includes(cls), `missing clearance "${cls}"`);
  }
  // No clearance when no bar is rendered (capture blocked / no result).
  assert.match(view, /metaPromo && isDone && data\.result && !captureBlocked\.blocked\s*\?\s*railAt/);
});

test("the anonymous CTA does not put a price on a free sign-up", () => {
  const ui = code("components/analyzer/meta-promo.tsx");
  assert.match(ui, /tier === "anon"\s*\?\s*t\("metaPromo\.signupCta"\)/);
  for (const locale of ["en", "es"] as const) {
    const ns = (messages[locale] as unknown as { metaPromo: Record<string, string> }).metaPromo;
    assert.doesNotMatch(ns.signupCta, /\d|\{price\}/, `[${locale}] signupCta must not quote a price`);
  }
});

test("the anonymous CTA carries no billing promise and is reported as sign-up intent", () => {
  const ui = code("components/analyzer/meta-promo.tsx");
  assert.match(ui, /locked && tier !== "anon" \?/, "cancelAnytime must not sit next to a free sign-up");
  assert.match(ui, /destination: cta\.href\.startsWith\("\/sign-up"\) \? "signup" : "checkout"/);
  // The bar must be told where the rail takes over; no silent default.
  assert.match(ui, /hideAt,\s*\n\}: PromoProps & \{ hideAt: "xl" \| "2xl" \}/);
});
