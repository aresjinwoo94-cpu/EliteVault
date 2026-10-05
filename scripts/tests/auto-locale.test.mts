import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { detectLocale, parseAcceptLanguage } from "../../lib/i18n/detect";

/**
 * Automatic site language (PR 2): detectLocale's rule table, getLocale()'s
 * precedence (QA override > flag > detection; the old NEXT_LOCALE cookie is
 * ignored), and the guarantee that the EN/ES button is gone.
 */

// ── detectLocale: the rule from the brief ───────────────────────────────────

const CASES: [string, { country?: string | null; acceptLanguage?: string | null }, "en" | "es"][] = [
  ["EC + es → es", { country: "EC", acceptLanguage: "es-EC,es;q=0.9,en;q=0.8" }, "es"],
  ["EC + only en → en (a visitor who doesn't read Spanish)", { country: "EC", acceptLanguage: "en-US,en;q=0.9" }, "en"],
  ["US + es-US first → es", { country: "US", acceptLanguage: "es-US,es;q=0.9,en;q=0.8" }, "es"],
  ["US + en first, es second → en (only the FIRST language counts)", { country: "US", acceptLanguage: "en-US,en;q=0.9,es;q=0.8" }, "en"],
  ["US + en → en", { country: "US", acceptLanguage: "en-US,en;q=0.9" }, "en"],
  ["no headers at all → en", {}, "en"],
  ["null headers → en", { country: null, acceptLanguage: null }, "en"],
  ["MX without accept-language → es (trust the country)", { country: "MX" }, "es"],
  ["MX with empty accept-language → es", { country: "MX", acceptLanguage: "" }, "es"],
  ["ES + es-ES → es", { country: "ES", acceptLanguage: "es-ES,es;q=0.9" }, "es"],
  ["lowercase country code is accepted", { country: "ar", acceptLanguage: "es-AR" }, "es"],
  ["MX + fr only → en", { country: "MX", acceptLanguage: "fr-FR,fr;q=0.9" }, "en"],
  ["DE + es first → es", { country: "DE", acceptLanguage: "es,en;q=0.8" }, "es"],
  ["DE + de → en", { country: "DE", acceptLanguage: "de-DE,de;q=0.9" }, "en"],
  ["BR (not in the list) + pt → en", { country: "BR", acceptLanguage: "pt-BR,pt;q=0.9" }, "en"],
  ["q-weights decide 'first': en q=1 beats es q=0.5", { country: "US", acceptLanguage: "es;q=0.5,en;q=1" }, "en"],
  ["wildcard only → en", { country: "US", acceptLanguage: "*" }, "en"],
  ["es;q=0 is not a language the visitor accepts", { country: "CO", acceptLanguage: "es;q=0,en" }, "en"],
];

for (const [name, input, want] of CASES) {
  test(`detectLocale: ${name}`, () => {
    assert.equal(detectLocale(input), want);
  });
}

test("every Spanish-speaking country in the brief maps to es without a header", () => {
  for (const c of "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ".split(" ")) {
    assert.equal(detectLocale({ country: c }), "es", c);
  }
});

test("parseAcceptLanguage orders by q and drops wildcards", () => {
  assert.deepEqual(parseAcceptLanguage("en;q=0.5, es-MX, fr;q=0.7, *;q=0.1"), ["es-mx", "fr", "en"]);
  assert.deepEqual(parseAcceptLanguage(null), []);
  assert.deepEqual(parseAcceptLanguage(""), []);
});

// ── getLocale: precedence ───────────────────────────────────────────────────

const nextHeadersUrl = pathToFileURL(
  resolve(import.meta.dirname, "../../node_modules/next/headers.js"),
).href;

let cookieJar: Record<string, string> = {};
let headerBag: Record<string, string> = {};

mock.module(nextHeadersUrl, {
  exports: {
    cookies: async () => ({
      get: (k: string) => (k in cookieJar ? { name: k, value: cookieJar[k] } : undefined),
    }),
    headers: async () => ({ get: (k: string) => headerBag[k.toLowerCase()] ?? null }),
  },
});

const { getLocale } = await import("../../lib/i18n/server");

function setup(opts: {
  flag?: string;
  cookies?: Record<string, string>;
  country?: string;
  al?: string;
}) {
  if (opts.flag === undefined) delete process.env.AUTO_LOCALE;
  else process.env.AUTO_LOCALE = opts.flag;
  cookieJar = opts.cookies ?? {};
  headerBag = {};
  if (opts.country) headerBag["x-vercel-ip-country"] = opts.country;
  if (opts.al) headerBag["accept-language"] = opts.al;
}

test("AUTO_LOCALE off (default): everyone gets English, whatever the headers", async () => {
  setup({ country: "MX", al: "es-MX" });
  assert.equal(await getLocale(), "en");
  setup({ flag: "false", country: "AR", al: "es-AR" });
  assert.equal(await getLocale(), "en");
});

test("AUTO_LOCALE on: detection decides", async () => {
  setup({ flag: "true", country: "MX", al: "es-MX" });
  assert.equal(await getLocale(), "es");
  setup({ flag: "true", country: "US", al: "en-US" });
  assert.equal(await getLocale(), "en");
  setup({ flag: "true" });
  assert.equal(await getLocale(), "en");
});

test("the old NEXT_LOCALE cookie is IGNORED (visitors from the removed button)", async () => {
  setup({ flag: "true", cookies: { NEXT_LOCALE: "es" }, country: "US", al: "en-US" });
  assert.equal(await getLocale(), "en");
  setup({ flag: "true", cookies: { NEXT_LOCALE: "en" }, country: "MX", al: "es-MX" });
  assert.equal(await getLocale(), "es");
  setup({ cookies: { NEXT_LOCALE: "es" }, country: "MX", al: "es-MX" }); // flag off
  assert.equal(await getLocale(), "en");
});

test("the QA cookie (EV_LANG_QA, from ?lang=) beats detection and works with the flag off", async () => {
  setup({ flag: "true", cookies: { EV_LANG_QA: "en" }, country: "MX", al: "es-MX" });
  assert.equal(await getLocale(), "en");
  setup({ flag: "true", cookies: { EV_LANG_QA: "es" }, country: "US", al: "en-US" });
  assert.equal(await getLocale(), "es");
  setup({ cookies: { EV_LANG_QA: "es" } }); // flag off: still lets QA review the Spanish UI
  assert.equal(await getLocale(), "es");
  setup({ flag: "true", cookies: { EV_LANG_QA: "fr" }, country: "MX", al: "es" }); // junk is ignored
  assert.equal(await getLocale(), "es");
});

// ── the button is gone; the QA param is wired ───────────────────────────────

const root = join(import.meta.dirname, "..", "..");
const code = (p: string) => readFileSync(join(root, p), "utf8");

test("the EN/ES toggle component and every use of it are gone", () => {
  assert.equal(existsSync(join(root, "components/i18n/language-toggle.tsx")), false);
  for (const f of [
    "components/marketing/nav.tsx",
    "components/marketing/footer.tsx",
    "components/dashboard/topbar.tsx",
  ]) {
    assert.doesNotMatch(code(f), /LanguageToggle|language-toggle/, f);
  }
});

test("the dead i18n copy and cookie constants are gone", () => {
  const messages = code("lib/i18n/messages.ts");
  assert.doesNotMatch(messages, /\n  lang: \{/, "the orphaned `lang` namespace");
  assert.doesNotMatch(code("lib/i18n/config.ts"), /LOCALE_COOKIE_MAX_AGE|"NEXT_LOCALE"/);
});

test("middleware turns ?lang=en|es into the session QA cookie, and nothing else", () => {
  const mw = code("middleware.ts");
  assert.match(mw, /searchParams\.get\("lang"\)/);
  assert.match(mw, /isLocale\(lang\)/);
  assert.match(mw, /QA_LOCALE_COOKIE/);
  // session cookie: no maxAge/expires
  assert.doesNotMatch(mw, /maxAge|expires/);
});

test("the root layout reflects the locale in <html lang> and adds no hreflang", () => {
  const layout = code("app/layout.tsx");
  assert.match(layout, /<html lang=\{locale\}/);
  assert.doesNotMatch(layout, /hreflang/i);
  assert.doesNotMatch(code("app/sitemap.ts"), /hreflang|alternates/i);
});
