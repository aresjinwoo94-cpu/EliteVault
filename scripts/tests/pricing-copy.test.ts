import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLANS } from "../../lib/stripe/plans";
import { messages } from "../../lib/i18n/messages";

/** Brief 2026-10 — plans + checkout copy: outcomes only, nothing the product doesn't do. */
type Block = Record<string, string>;
const plansOf = (l: "en" | "es") => (messages[l] as unknown as { plans: Record<string, Block> }).plans;
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

test("every plan feature is included (no greyed-out ✗ rows) and fits the checkout window", () => {
  for (const p of Object.values(PLANS)) {
    assert.ok(p.features.every((f) => f.included), `${p.id} lists an excluded feature`);
    assert.ok(p.features.length >= 4 && p.features.length <= 6, `${p.id} has ${p.features.length} bullets`);
  }
});

test("EN and ES have exactly one f<i> key per feature — none missing, none left over", () => {
  for (const l of ["en", "es"] as const) {
    for (const p of Object.values(PLANS)) {
      const keys = Object.keys(plansOf(l)[p.id]).filter((k) => /^f\d+$/.test(k)).sort();
      assert.deepEqual(keys, p.features.map((_, i) => `f${i}`), `${l}.${p.id}`);
    }
  }
});

test("retired claims are gone from plans and messages (EN + ES)", () => {
  const stale = /unlimited audits|unlimited analyses|For teams|Para equipos|bearer|Image-similarity|\bscore\b|puntuaci[oó]n|crystal ball|Your total is shown|Credits load|cr[eé]ditos se cargan|87\.2|79\.5/i;
  for (const l of ["en", "es"] as const) {
    for (const [id, b] of Object.entries(plansOf(l))) {
      for (const [k, v] of Object.entries(b)) assert.doesNotMatch(v, stale, `${l}.${id}.${k}: ${v}`);
    }
    const m = messages[l] as unknown as { checkout: Block; pricing: Block };
    for (const k of ["stripeSubmit", "outcomePro", "outcomeScale", "cancelAnytime", "instantAccess", "back"]) {
      assert.ok(m.checkout[k], `${l}.checkout.${k}`);
      assert.doesNotMatch(m.checkout[k], stale, `${l}.checkout.${k}`);
    }
    for (const k of ["totalInPanel", "totalInPanelYear", "creditsInstant", "backToBilling", "stripeIncludesPro", "stripeIncludesScale"]) {
      assert.equal(m.checkout[k], undefined, `${l}.checkout.${k} should be deleted`);
    }
    for (const k of ["ladderDiagnose", "ladderCure", "ladderVolume", "ctaStart"]) assert.equal(m.pricing[k], undefined, `${l}.pricing.${k}`);
  }
  for (const p of Object.values(PLANS)) {
    for (const t of [p.description, p.tagline, p.badge ?? "", ...p.features.map((f) => f.text)]) assert.doesNotMatch(t, stale, `${p.id}: ${t}`);
  }
});

test("pricing page: no value-ladder chips, no ✗ rows, local-currency note under Pro", () => {
  const src = read("components/marketing/pricing.tsx");
  assert.doesNotMatch(src, /ladder/);
  assert.doesNotMatch(src, /\bX\b[^a-zA-Z]*from "lucide-react"|<X /);
  assert.match(src, /plan\.id === "pro"[\s\S]{0,200}pricing\.localCurrencyNote/);
  assert.match(src, /pricing\.ctaGet/);
});

test("the FAQ falls back to the English item when a translation key is missing", () => {
  const src = read("components/marketing/faq.tsx");
  assert.match(src, /value === key \? fallback : value/);
  assert.doesNotMatch(src, /t\(`faqContent\.[qa]\$\{i\}`\) \|\|/);
  for (const l of ["en", "es"] as const) {
    const fc = (messages[l] as unknown as { faqContent: Block }).faqContent;
    assert.ok(fc.q5 && fc.a5, `${l} faqContent.q5/a5`);
  }
});
