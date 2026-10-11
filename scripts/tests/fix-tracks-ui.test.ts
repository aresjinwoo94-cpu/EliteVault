import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";
import { toClientAnalysis } from "../../lib/analyzer/client-payload";
import { analyzerFixTracksEnabled } from "../../lib/flags";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const NS = () => ({
  en: (messages.en as unknown as Record<string, Record<string, string>>).fixTracks,
  es: (messages.es as unknown as Record<string, Record<string, string>>).fixTracks,
});

test("fixTracks copy exists in en AND es with identical keys (nothing falls back to English in ES)", () => {
  const { en, es } = NS();
  assert.ok(en && es);
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en)) assert.ok(es[k].trim().length > 0, k);
  assert.equal(en.tabUrgent, "Most urgent");
  assert.equal(es.tabUrgent, "Lo más urgente");
  assert.equal(en.tabPost, "Sell more after the purchase");
  assert.equal(es.tabPost, "Vender más después de la compra");
  assert.equal(en.tabTheme, "Shopify theme & colors");
  assert.equal(es.tabTheme, "Tema y colores para Shopify");
  assert.equal(en.tabCompetitor, "Match your niche's top store");
  assert.equal(es.tabCompetitor, "Parecerte al ganador de tu nicho");
  assert.equal(en.pickPrompt, "Pick the fixes you want to see — free plan unlocks one.");
  assert.equal(es.pickPrompt, "Elige qué fixes quieres ver — el plan gratis desbloquea uno.");
});

test("post_purchase ALWAYS renders the 'we don't see your checkout or emails' line", () => {
  const { en, es } = NS();
  assert.equal(en.postNote, "Based on your product page — we don't see your checkout or emails.");
  assert.equal(es.postNote, "Basado en tu página de producto — no vemos tu checkout ni tus emails.");
  const src = read("components/analyzer/fix-tracks.tsx");
  // The note is attached to the track itself, not to any data/status condition.
  assert.match(src, /active === "post_purchase" \?\s*\(\s*<p[^>]*>\{t\("fixTracks\.postNote"\)\}<\/p>/);
});

test("honest empty state copy for competitor matches the brief", () => {
  const { en, es } = NS();
  assert.equal(en.emptyCompetitor, "We don't have a breakdown of a top store in your niche yet.");
  assert.equal(es.emptyCompetitor, "Aún no tenemos el desglose de una tienda ganadora en tu nicho.");
});

test("competitor button is disabled with the coming-soon copy when the niche has no teardown winner", () => {
  const { en, es } = NS();
  assert.equal(en.comingSoon, "Coming soon for your niche");
  assert.equal(es.comingSoon, "Pronto en tu nicho");
  const src = read("components/analyzer/fix-tracks.tsx");
  assert.ok(src.includes('if (track === "competitor" && !competitorAvailable) return;')); // not selectable
  assert.ok(src.includes("aria-disabled={soon || undefined}"));
  for (const page of ["app/(app)/app/analyzer/[id]/page.tsx", "app/audit/[id]/page.tsx"]) {
    assert.match(read(page), /competitorAvailable/, page);
  }
});

test("flag off ⇒ AnalysisView renders the classic TopFixes (FixTracks only when viewer.fixTracks is set)", () => {
  const src = read("components/analyzer/analysis-view.tsx");
  assert.match(src, /viewer\.fixTracks && !captureBlocked\.blocked \? \(\s*<FixTracks/);
  assert.match(src, /\) : \(\s*<TopFixes\s+fixes=\{data\.result\.top_fixes\}\s+unlockedCount=\{viewer\.isPaid \? undefined : 1\}/);
  for (const page of ["app/(app)/app/analyzer/[id]/page.tsx", "app/audit/[id]/page.tsx"]) {
    assert.match(read(page), /fixTracks: analyzerFixTracksEnabled\(\)/, page);
  }
  const prev = process.env.ANALYZER_FIX_TRACKS;
  process.env.ANALYZER_FIX_TRACKS = "false";
  assert.equal(analyzerFixTracksEnabled(), false);
  delete process.env.ANALYZER_FIX_TRACKS;
  assert.equal(analyzerFixTracksEnabled(), true); // shipped ON with the UI + landing cards
  if (prev !== undefined) process.env.ANALYZER_FIX_TRACKS = prev;
});

test("the Fix Tracks cache never reaches the browser (full text of locked fixes)", () => {
  const row = {
    id: "a",
    result: {},
    niche_winners: [1],
    meta_ads: null,
    fix_tracks: { free_choice: "post_purchase", post_purchase: { fixes: [{ title: "secret #2", why: "secret why" }] } },
  };
  const out = toClientAnalysis(row, { canSeeOptimizer: false }) as Record<string, unknown>;
  assert.equal("fix_tracks" in out, false);
  assert.equal(JSON.stringify(out).includes("secret"), false);
});

test("landing cards: icons match the brief and card 3 keeps Search", () => {
  const src = read("components/marketing/social-strip.tsx");
  assert.match(src, /icon: Repeat, titleKey: "socialStrip\.b1Title"/);
  assert.match(src, /icon: LayoutTemplate, titleKey: "socialStrip\.b2Title"/);
  assert.match(src, /icon: Search, titleKey: "socialStrip\.b3Title"/);
  assert.match(src, /icon: Target, titleKey: "socialStrip\.b4Title"/);
});

test("no old landing strings linger anywhere in app code", () => {
  const files = ["lib/i18n/messages.ts", "components/marketing/social-strip.tsx"];
  for (const f of files) {
    const s = read(f);
    for (const old of ["Find your highest-impact fixes", "Know your store's real potential", "$0 to run your first audit", "Lo que te llevas"]) {
      assert.equal(s.includes(old), false, `${f} still has "${old}"`);
    }
  }
});
