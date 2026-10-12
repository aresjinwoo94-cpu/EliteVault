/**
 * End-to-end plan matrix — ONE store, ONE run per plan (anonymous, free, pro, scale), nothing else.
 *
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server \
 *       --experimental-test-module-mocks scripts/e2e/plan-matrix.mts https://www.example-store.com
 *
 * What is REAL: the screenshot chain, the Analyzer vision agent, score derivation, the niche matcher
 * against the real Library, the Scale-only Optimizer agent, the REAL route handler of the Fix Tracks
 * (ownership, gating, claim/cache RPCs in the production database), the simulation orchestrator,
 * the payload gating and the winners module. The Gemini calls use GEMINI_API_KEY_JOBS (the guard
 * below refuses to run on the production key).
 *
 * What is NOT: the Next.js/Supabase *authentication* layer. An automated agent must not sign in to
 * production accounts, so the route handlers run in-process with the session lookup replaced by "this
 * plan's user" (and the anonymous cookie by a token). Everything the handler does after identifying
 * the viewer — which is where all the gating lives — is the production code against the production DB.
 * Inngest/Vercel orchestration of the analysis is not exercised either (run one anonymous audit from
 * the public site for that).
 *
 * Clean-up: every analyses row created here is deleted at the end; the pro test account's plan is
 * restored. Exit code 1 if any check fails.
 */
import "../lib/require-jobs-key.mjs";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(import.meta.dirname, "../..");
const u = (p: string) => pathToFileURL(resolve(ROOT, p)).href;
const STORE = process.argv[2];
if (!STORE || !/^https?:\/\//i.test(STORE)) {
  console.error("usage: plan-matrix.mts <https://store-url>");
  process.exit(1);
}

// ── identity under test (swapped per plan) ───────────────────────────────────
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CUR: { userId: string | null; anonToken: string | null } = { userId: null, anonToken: null };

mock.module(u("lib/supabase/server.ts"), {
  exports: {
    createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: CUR.userId ? { id: CUR.userId } : null } }) } }),
    createSupabaseServiceClient: () => svc,
    getUserResult: async () => ({ data: { user: CUR.userId ? { id: CUR.userId } : null } }),
  },
});
mock.module(u("lib/anon/session.ts"), { exports: { getAnonToken: async () => CUR.anonToken } });
mock.module(u("lib/i18n/server.ts"), { exports: { getLocale: async () => "en" } });
process.env.ANALYZER_FIX_TRACKS = "true";

const { captureScreenshot } = await import("../../lib/screenshot-core.ts");
const { runAnalyzerAgent } = await import("../../ai/agents/analyzer-agent.ts");
const { runMetaAdsOptimizerAgent } = await import("../../ai/agents/meta-ads-optimizer-agent.ts");
const { runMetaSimulation } = await import("../../ai/agents/run-meta-simulation.ts");
const { withDerivedScore } = await import("../../lib/analyzer/derive-score.ts");
const { scenarioMidpoints } = await import("../../lib/analyzer/conversion-scenarios.ts");
const { buildNicheWinnersFromScreenshot, loadNicheWinnersModule } = await import("../../lib/library/niche-winners.ts");
const { toClientAnalysis } = await import("../../lib/analyzer/client-payload.ts");
const { PLANS } = await import("../../lib/stripe/plans.ts");
const { SHOPIFY_THEMES } = await import("../../lib/analyzer/shopify-themes.ts");
const { GET: fixTrack } = await import("../../app/api/analyses/[id]/fix-tracks/[track]/route.ts");

// ── tiny reporter ────────────────────────────────────────────────────────────
type Row = { plan: string; check: string; ok: boolean; note: string };
const rows: Row[] = [];
function check(plan: string, name: string, ok: boolean, note = "") {
  rows.push({ plan, check: name, ok, note });
  console.log(`${ok ? "  ✓" : "  ✗"} [${plan}] ${name}${note ? " — " + note : ""}`);
}

async function track(analysisId: string, t: string) {
  const res = await fixTrack(new Request("http://e2e") as never, { params: Promise.resolve({ id: analysisId, track: t }) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

// ── accounts (existing test accounts only; nothing is created) ───────────────
const ACCOUNTS = {
  free: "elitevault.test.90829@gmail.com",
  pro: "test-pro@elitevault.local",
  scale: "aresjinwoo94@gmail.com",
} as const;
const prof: Record<string, { id: string; plan: string }> = {};
for (const [plan, email] of Object.entries(ACCOUNTS)) {
  const { data } = await svc.from("profiles").select("id, plan").eq("email", email).maybeSingle();
  if (!data) {
    console.error(`✗ test account ${email} not found`);
    process.exit(1);
  }
  prof[plan] = data as { id: string; plan: string };
}
const originalProPlan = prof.pro.plan;
const created: string[] = [];

try {
  if (originalProPlan !== "pro") await svc.from("profiles").update({ plan: "pro" }).eq("id", prof.pro.id);

  // ── one capture, one niche match (reused by the four runs) ────────────────
  console.log(`\nStore: ${STORE}\nCapturing…`);
  const shot = await captureScreenshot(STORE, { budgetMs: 45_000 });
  console.log(`  captured via ${shot.provider} (${Math.round(shot.base64.length / 1024)} KB base64)`);
  const match = await buildNicheWinnersFromScreenshot({ screenshotBase64: shot.base64, mediaType: shot.mediaType, url: STORE });
  const nicheWinners = match
    ? { niche: match.result.niche, nicheLabel: match.result.nicheLabel, scope: match.scope, winners: match.result.winners }
    : null;
  console.log(`  niche: ${match?.detectedNiche ?? "unclassified"} · stored winners: ${nicheWinners?.winners.length ?? 0}`);

  const host = new URL(STORE).hostname.replace(/^www\./, "").split(".")[0];

  for (const plan of ["anon", "free", "pro", "scale"] as const) {
    console.log(`\n══ ${plan.toUpperCase()} ══`);
    const isAnon = plan === "anon";
    const userId = isAnon ? null : prof[plan].id;
    const anonId = isAnon ? `e2e-${Date.now()}` : null;

    // 1) a real analysis run for this plan
    const t0 = Date.now();
    const audit = await runAnalyzerAgent({ screenshotBase64: shot.base64, mediaType: shot.mediaType, url: STORE, deadlineAt: Date.now() + 90_000 });
    const scored = withDerivedScore(audit);
    scored.scenarios = scenarioMidpoints(scored.score, host);
    const metaAds = plan === "scale" ? await runMetaAdsOptimizerAgent({ url: STORE, score: scored.score ?? 0, summary: scored.summary, topFixes: scored.top_fixes ?? [], persona: null, niche: host, siteInfo: null }).catch(() => null) : null;
    console.log(`  analyzer run: ${((Date.now() - t0) / 1000).toFixed(1)}s · score ${scored.score} · ${scored.top_fixes?.length ?? 0} fixes${metaAds ? " · optimizer ✓" : ""}`);

    const { data: ins, error: insErr } = await svc
      .from("analyses")
      .insert({
        user_id: userId,
        anon_id: anonId,
        url: STORE,
        status: "succeeded",
        result: scored,
        meta_ads: metaAds,
        niche_winners: nicheWinners,
        detected_niche: match?.detectedNiche ?? null,
        credits_charged: 0,
        finished_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (insErr || !ins) throw new Error(`insert failed: ${insErr?.message}`);
    const id = (ins as { id: string }).id;
    created.push(id);

    CUR.userId = userId;
    CUR.anonToken = anonId;
    const paid = plan === "pro" || plan === "scale";

    // 2) payload gating: the Optimizer is Scale-only, on the server
    const client = toClientAnalysis({ id, meta_ads: metaAds, niche_winners: nicheWinners, fix_tracks: { free_choice: "x" } } as Record<string, unknown>, { canSeeOptimizer: PLANS[plan === "anon" ? "free" : plan].unlocksScale }) as Record<string, unknown>;
    check(plan, "client payload: fix_tracks and niche_winners never shipped", !("fix_tracks" in client) && !("niche_winners" in client));
    check(plan, "client payload: Optimizer only for Scale", plan === "scale" ? client.meta_ads != null : client.meta_ads == null);

    // 3) Fix Tracks through the real route
    if (!paid) {
      // urgent is open to everyone and spends nothing: no AI, free_choice untouched
      const u0 = await track(id, "urgent");
      check(plan, "urgent is served first (0 AI) and does NOT spend the free pick", u0.status === 200 && u0.body.fixes === null && (u0.body.choice ?? null) === null);
      const { data: st0 } = await svc.from("analyses").select("fix_tracks").eq("id", id).single();
      check(plan, "DB: viewing urgent wrote no free_choice", !((st0 as { fix_tracks: Record<string, unknown> | null }).fix_tracks ?? {}).free_choice);
      const first = await track(id, "post_purchase");
      check(plan, "free/anon: first pick (post_purchase) is served", first.status === 200 && Array.isArray(first.body.fixes) && first.body.fixes.length > 0, `status ${first.status}, ${first.body.fixes?.length ?? 0} fixes`);
      const f = (first.body.fixes ?? []) as Record<string, any>[];
      check(plan, "fix #1 complete with evidence; #2+ stripped server-side", !!f[0]?.evidence && f.slice(1).every((x) => x.locked === true && x.why === undefined && x.evidence === undefined));
      const second = await track(id, "theme_colors");
      check(plan, "second distinct track is locked (403) — no AI", second.status === 403 && second.body.error === "locked", `status ${second.status}`);
      const urgent = await track(id, "urgent");
      check(plan, "urgent stays visible after the pick", urgent.status === 200 && urgent.body.fixes === null);
      const { data: st } = await svc.from("analyses").select("fix_tracks").eq("id", id).single();
      const ft = (st as { fix_tracks: Record<string, unknown> | null }).fix_tracks ?? {};
      check(plan, "DB: exactly one choice, no theme_colors generated", ft.free_choice === "post_purchase" && !("theme_colors" in ft));
      // another browser / another user cannot read it
      CUR.userId = isAnon ? null : prof.scale.id;
      CUR.anonToken = isAnon ? "someone-else" : null;
      const stranger = await track(id, "post_purchase");
      check(plan, "another viewer gets 403", stranger.status === 403, `status ${stranger.status}`);
      CUR.userId = userId;
      CUR.anonToken = anonId;
    } else {
      const seen: Record<string, Record<string, any>> = {};
      for (const t of ["urgent", "post_purchase", "theme_colors", "competitor"]) {
        const r = await track(id, t);
        seen[t] = r;
        if (t === "urgent") check(plan, "urgent opens (0 AI)", r.status === 200 && r.body.fixes === null);
        else if (t === "competitor" && r.body.empty === "no_competitor") check(plan, "competitor: honest empty state", !match?.detectedNiche || !["home","skincare","pet","baby","eyewear","grooming","wellness","accessories","fitness","footwear","apparel","beverage","beauty"].includes(match.detectedNiche), `niche ${match?.detectedNiche} has teardowns now — empty state is a bug`);
        else {
          const fx = (r.body.fixes ?? []) as Record<string, any>[];
          check(plan, `${t}: generated, every fix has evidence, nothing locked`, r.status === 200 && fx.length > 0 && fx.every((x) => x.evidence && !x.locked), `status ${r.status}, ${fx.length} fixes`);
          check(plan, `${t}: no invented % / $ figures`, fx.every((x) => !/\d\s?%|[$€£]\s?\d/.test(`${x.title} ${x.why} ${x.evidence}`)));
          if (t === "theme_colors") check(plan, "theme_colors: any theme named is in the verified list", fx.every((x) => !x.theme_slug || SHOPIFY_THEMES.some((th) => th.slug === x.theme_slug)));
          if (t === "competitor") check(plan, "competitor: benchmark store is same-niche and not the analyzed store", !!r.body.meta?.competitor?.domain && !STORE.includes(r.body.meta.competitor.domain), String(r.body.meta?.competitor?.domain));
        }
      }
      const again = await track(id, "post_purchase");
      check(plan, "second request is served from cache", again.status === 200 && again.body.cached === true);
    }

    // 4) winners card: Free sees a teaser (no store data); paid sees real stores that link to the store
    const mod = await loadNicheWinnersModule({ status: "succeeded", url: STORE, summary: scored.summary, isPaid: paid, stored: nicheWinners });
    const anyWinners = (mod?.winners?.length ?? 0) > 0;
    if (!paid) check(plan, "winners: locked teaser (≤1 real row + a count)", !mod || (mod.locked === true && mod.winners.length <= 1), mod ? `locked=${mod.locked}, rows=${mod.winners.length}, hidden=${mod.lockedCount}` : "module hidden");
    else check(plan, "winners: real stores with a clean store link", !mod || (anyWinners && mod.winners.every((w: { url: string }) => /^https?:\/\/[^?#]+$/.test(w.url))), mod ? `${mod.winners.length} stores` : "module hidden (no niche)");
    check(plan, "winners: no 'N active ads' badge (no row has a real Meta measurement)", !mod || mod.winners.every((w: { activeAds: number | null }) => w.activeAds == null));

    // 5) simulator: Pro + Scale only (engine numbers + 1 narrative call)
    check(plan, "Meta simulator allowed only for Pro/Scale", (PLANS[plan === "anon" ? "free" : plan].quotas.metaRunsPerMonth ?? 1) !== 0 === paid);
    if (paid) {
      const t1 = Date.now();
      const sim = await runMetaSimulation({ url: STORE, score: scored.score ?? 0, summary: scored.summary, niche: match?.detectedNiche ?? host, aovUsd: 60, dailyBudgetUsd: 100, productMarginPct: 40 });
      const { conservative: c, balanced: b, aggressive: a } = sim;
      check(plan, "simulation: 3 scenarios × 7 days, errors none", !!c && !!b && !!a && [c, b, a].every((s) => s!.days.length === 7) && sim.errors.length === 0, `${((Date.now() - t1) / 1000).toFixed(1)}s`);
      check(plan, "simulation: conservative ≤ balanced ≤ aggressive (ROAS, purchases)", c!.totals.roas <= b!.totals.roas && b!.totals.roas <= a!.totals.roas && c!.totals.purchases <= b!.totals.purchases && b!.totals.purchases <= a!.totals.purchases);
      check(plan, "simulation: break-even visible (40% margin ⇒ 2.5x) and a ROAS range", b!.economics?.break_even_roas === 2.5 && Array.isArray(b!.totals.roas_range));
    }
  }
} finally {
  // ── clean-up: leave no trace ──────────────────────────────────────────────
  if (created.length) await svc.from("analyses").delete().in("id", created);
  if (originalProPlan !== "pro") await svc.from("profiles").update({ plan: originalProPlan }).eq("id", prof.pro.id);
  console.log(`\nClean-up: deleted ${created.length} analyses rows; pro test account restored to "${originalProPlan}".`);
}

const failed = rows.filter((r) => !r.ok);
console.log(`\n══ SUMMARY: ${rows.length - failed.length}/${rows.length} checks passed ══`);
for (const f of failed) console.log(`  ✗ [${f.plan}] ${f.check}${f.note ? " — " + f.note : ""}`);
process.exit(failed.length ? 1 : 0);
