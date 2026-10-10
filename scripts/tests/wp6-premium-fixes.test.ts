import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";
import { PLANS } from "../../lib/stripe/plans";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const LIVE_FILTER = /\.eq\("status", "published"\)\s*\.eq\("is_live", true\)/;

// ── H1: the Library only ever reads published + live stores ─────────────────
test("every Library read of winning_sites filters published AND live (code) …", () => {
  const reads: [string, number][] = [
    ["app/actions/search.ts", 3], // listing/search, getNiches, stats (count + niche)
    ["lib/library/niche-pages.ts", 2], // niche index + niche page
    ["app/(app)/app/page.tsx", 1], // dashboard counter
  ];
  for (const [file, min] of reads) {
    const n = (read(file).match(new RegExp(LIVE_FILTER.source, "g")) ?? []).length;
    assert.ok(n >= min, `${file}: expected ≥ ${min} filtered reads, found ${n}`);
  }
  // getLibraryStats has two reads (count + niche list) → at least 4 in search.ts overall:
  assert.ok((read("app/actions/search.ts").match(/"is_live", true/g) ?? []).length >= 4);
});

test("… and the database enforces it (migration 0037 + rollback)", () => {
  const up = read("supabase/migrations/0037_winning_sites_rls_published.sql");
  assert.match(up, /drop policy if exists "sites: public read" on public\.winning_sites/);
  assert.match(up, /for select to anon, authenticated/);
  assert.match(up, /using \(status = 'published' and is_live = true\)/);
  const down = read("supabase/rollbacks/0037_winning_sites_rls_published_rollback.sql");
  assert.match(down, /for select using \(true\)/);
});

// ── winners card → the STORE, not the Ad Library ────────────────────────────
test("Winners card CTA opens the store (clean link), in en and es; the Ad Library link is gone", () => {
  const src = read("components/analyzer/niche-winners.tsx");
  assert.doesNotMatch(src, /href=\{w\.adsUrl\}/);
  assert.doesNotMatch(src, /Megaphone/);
  assert.match(src, /href=\{w\.url\}\s*\n\s*target="_blank"\s*\n\s*rel="noopener nofollow"/);
  assert.match(src, /nicheWinners\.visitStore/);
  const en = (messages.en as unknown as Record<string, Record<string, string>>).nicheWinners;
  const es = (messages.es as unknown as Record<string, Record<string, string>>).nicheWinners;
  assert.equal(en.visitStore, "Visit their store");
  assert.equal(es.visitStore, "Visitar su tienda");
  assert.equal("seeAds" in en, false);
  assert.equal("seeAds" in es, false);
  // the "N active ads" proof-of-scaling badge stays
  assert.match(src, /nicheWinners\.activeAds/);
});

// ── pricing ↔ product ───────────────────────────────────────────────────────
test("the pricing no longer promises a priority queue / priority support (en + es)", () => {
  for (const plan of Object.values(PLANS)) {
    for (const f of plan.features) assert.doesNotMatch(f.text, /priority (queue|support)/i, `${plan.id}: ${f.text}`);
  }
  for (const locale of ["en", "es"] as const) {
    const scale = (messages[locale] as unknown as { plans: { scale: Record<string, string> } }).plans.scale;
    for (const v of Object.values(scale)) assert.doesNotMatch(v, /priority (queue|support)|prioritari/i, `${locale}: ${v}`);
  }
});

test("the Free plan describes Fix Tracks: 1 audit + you choose one type of fixes", () => {
  const free = PLANS.free;
  assert.ok(free.features.some((f) => /choose one type of fixes/i.test(f.text)));
  assert.doesNotMatch(free.description, /#1 priority fix/);
  assert.match(free.description, /one set of fixes of your choice/);
  const es = (messages.es as unknown as { plans: { free: Record<string, string> } }).plans.free;
  assert.match(es.f1, /Eliges un tipo de correcciones/);
  assert.doesNotMatch(es.desc, /corrección prioritaria nº 1/);
  const en = (messages.en as unknown as { plans: { free: Record<string, string> } }).plans.free;
  assert.match(en.f1, /choose one type of fixes/i);
});

test("Compare Mode is gated on the SERVER for Pro/Scale (it is sold as Pro/Scale)", () => {
  const src = read("app/(app)/app/community/compare/page.tsx");
  assert.match(src, /plan\.canPublish/);
  assert.match(src, /redirect\("\/sign-in/);
  assert.equal(PLANS.free.canPublish, false);
  assert.equal(PLANS.pro.canPublish && PLANS.scale.canPublish, true);
  // the data query happens AFTER the gate
  assert.ok(src.indexOf("plan.canPublish") < src.indexOf('from("community_analyses")'));
  for (const locale of ["en", "es"] as const) {
    const c = (messages[locale] as unknown as { community: Record<string, string> }).community;
    assert.ok(c.compareLockedTitle && c.compareLockedBody && c.compareLockedCta, locale);
  }
});

// Premium audit H1 (verifier finding): the winners module had two UNFILTERED fallbacks that
// ran on ANY query error and could show review/dead stores to paying users. They are gone.
test("winners module fails closed: no unfiltered winning_sites fallback, only http(s) links", () => {
  const src = read("lib/library/niche-winners.ts");
  assert.doesNotMatch(src, /\.select\(LEGACY_COLS\)/);
  assert.doesNotMatch(src, /trying legacy shape/);
  // every service read of winning_sites inside this module carries both filters
  const reads = src.match(/\.from\("winning_sites"\)[\s\S]{0,260}?(?=\n\s*(?:const|let|if|return|\/\/|\}))/g) ?? [];
  assert.ok(reads.length >= 3);
  for (const r of reads) {
    assert.match(r, /\.eq\("status", "published"\)/, r.slice(0, 120));
    assert.match(r, /\.eq\("is_live", true\)/, r.slice(0, 120));
  }
  assert.ok(src.includes("/^https?:"), "only http(s) store links reach the card");
});

test("teardown job never adds a second teardown and counts only real writes", () => {
  const src = read("scripts/library/teardown.mts");
  assert.match(src, /if \(inNiche\.some\(\(r\) => r\.teardown\)\) continue;/);
  assert.match(src, /\.is\("teardown", null\)/);
  assert.match(src, /upd\.length > 0/);
});
