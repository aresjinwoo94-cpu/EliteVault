import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAnalyzerUserMessage } from "../../ai/prompts";

const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("getLocale: owner → en sits after the QA cookie and before the flag/detection", () => {
  const s = code("lib/i18n/server.ts");
  const qa = s.indexOf("if (isLocale(qa)) return qa;");
  const owner = s.indexOf("isOwnerSession(store)", qa);
  const flag = s.indexOf("if (!autoLocaleEnabled())");
  assert.ok(qa > 0 && owner > qa && flag > owner);
  assert.match(s, /ADMIN_EMAILS \|\| process\.env\.INTERNAL_EMAILS/);
  // no Supabase call for anonymous visitors: gated on the session cookie
  assert.match(s, /AUTH_COOKIE\.test/);
});

test("audit language: es adds a language line, en/undefined do not", () => {
  const es = buildAnalyzerUserMessage({ url: "https://a.com", locale: "es" });
  assert.match(es, /natural Spanish/);
  for (const l of [undefined, "en" as const]) {
    assert.doesNotMatch(buildAnalyzerUserMessage({ url: "https://a.com", locale: l }), /LANGUAGE:/);
  }
});

test("audit language: both actions send the viewer's locale through the event to the agent", () => {
  assert.match(code("app/actions/analyzer.ts"), /locale: await getLocale\(\)/);
  assert.match(code("app/actions/anon-analyzer.ts"), /locale: await getLocale\(\)/);
  assert.match(code("inngest/functions/analyze-website.ts"), /locale: locale === "es" \? "es" : "en"/);
  assert.match(code("ai/agents/analyzer-agent.ts"), /locale: opts\.locale/);
});
