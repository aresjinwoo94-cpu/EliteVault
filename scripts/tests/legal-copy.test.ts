import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const PAGES = ["app/legal/privacy/page.tsx", "app/legal/terms/page.tsx", "app/legal/refunds/page.tsx"];

test("legal pages ship no draft markers and are dated October 2026", () => {
  for (const p of PAGES) {
    const src = read(p);
    assert.doesNotMatch(src, /\[(Confirmar|Definir|TODO)/i, p);
    assert.doesNotMatch(src, /TODO: revisi/i, p);
    assert.doesNotMatch(src, /asesor[ií]a/i, p);
    assert.match(src, /LAST_UPDATED = "October 2026"/, p);
  }
});

test("no surface claims screenshots are not shared with third parties, in EN or ES", () => {
  const surfaces = [
    "lib/content/faq.ts",
    "lib/support/kb.ts",
    "lib/i18n/dict/ui-en.json",
    "lib/i18n/dict/ui-es.json",
    "app/llms.txt/route.ts",
    "app/legal/privacy/page.tsx",
  ];
  for (const p of surfaces) {
    const src = read(p);
    assert.doesNotMatch(src, /(don't|do not|never) share (your )?screenshots with third/i, p);
    assert.doesNotMatch(src, /ni compartimos capturas con terceros/i, p);
    assert.doesNotMatch(src, /private to your account\. We don't train/i, p);
  }
});

test("FAQ, support KB, dictionaries and policy agree on Gemini free tier + share links", () => {
  for (const p of ["lib/content/faq.ts", "lib/i18n/dict/ui-en.json", "lib/support/kb.ts"]) {
    const src = read(p);
    assert.match(src, /Gemini/, p);
    assert.match(src, /free tier/i, p);
    assert.match(src, /share link/i, p);
  }
  assert.match(read("lib/i18n/dict/ui-es.json"), /nivel gratuito de Gemini/);
  assert.match(read("lib/i18n/dict/ui-es.json"), /enlace para compartir/);
  assert.match(read("app/legal/privacy/page.tsx"), /unless you create a share\s+link/);
});

test("privacy policy lists every screenshot-capture provider the code can call", () => {
  const privacy = read("app/legal/privacy/page.tsx");
  const timings = read("lib/analyzer/timings.ts");
  const m = timings.match(/CAPTURE_PROVIDERS = \[([^\]]+)\]/);
  assert.ok(m, "CAPTURE_PROVIDERS not found");
  const names = m![1].match(/"([a-z]+)"/g)!.map((s) => s.replace(/"/g, ""));
  const listed: Record<string, RegExp> = {
    screenshotone: /ScreenshotOne/,
    thumio: /thum\.io/,
    microlink: /Microlink/,
    mshots: /mshots/,
  };
  for (const n of names) {
    if (n === "og") continue; // reads the target site's own og:image, no third party
    assert.ok(listed[n], `capture provider "${n}" has no policy mapping — update the policy and this test`);
    assert.match(privacy, listed[n], `policy must list ${n}`);
  }
});
