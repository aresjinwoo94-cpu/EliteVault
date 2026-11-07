import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { visitorCity, visitorCountry } from "../../lib/geo/visitor-geo";
import { currencyForCountry } from "../../lib/currency/country-currency";
import { detectLocale } from "../../lib/i18n/detect";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("country comes from Vercel's header or Cloudflare's, upper-cased", () => {
  assert.equal(visitorCountry(h({ "x-vercel-ip-country": "MX" })), "MX");
  assert.equal(visitorCountry(h({ "cf-ipcountry": "co" })), "CO");
  assert.equal(visitorCountry(h({ "x-vercel-ip-country": "ES", "cf-ipcountry": "US" })), "ES"); // Vercel wins
});

test("unknown / Tor / malformed country → null (never a fake country)", () => {
  for (const v of ["XX", "T1", "", "  ", "MEX", "1", "m"]) assert.equal(visitorCountry(h({ "cf-ipcountry": v })), null, v);
  assert.equal(visitorCountry(h({})), null);
});

test("city is decoded (Vercel URL-encodes it) and survives plain text from Cloudflare", () => {
  assert.equal(visitorCity(h({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" })), "São Paulo");
  assert.equal(visitorCity(h({ "cf-ipcity": "Quito" })), "Quito");
  assert.equal(visitorCity(h({ "cf-ipcity": "100% Real" })), "100% Real"); // malformed %-sequence must not throw
  assert.equal(visitorCity(h({})), null);
});

test("Cloudflare country drives currency and language exactly like Vercel's did", () => {
  assert.equal(currencyForCountry(visitorCountry(h({ "cf-ipcountry": "MX" }))), "MXN");
  assert.equal(currencyForCountry(visitorCountry(h({ "cf-ipcountry": "CO" }))), "COP");
  assert.equal(currencyForCountry(visitorCountry(h({ "cf-ipcountry": "DE" }))), "EUR");
  assert.equal(currencyForCountry(visitorCountry(h({}))), "USD");
  assert.equal(detectLocale({ country: visitorCountry(h({ "cf-ipcountry": "AR" })) }), "es");
  assert.equal(detectLocale({ country: visitorCountry(h({ "cf-ipcountry": "US" })), acceptLanguage: "es-US,es" }), "en");
});

test("no server code reads x-vercel-ip-* directly any more (one helper for every edge)", () => {
  for (const f of ["app/api/track/route.ts", "lib/currency/server.ts", "lib/i18n/server.ts"]) {
    assert.doesNotMatch(read(f), /headers?\.get\("x-vercel-ip/, f);
    assert.match(read(f), /visitor(Country|City)/, f);
  }
});

test("Vercel Analytics / Speed Insights load only when running on Vercel", () => {
  assert.match(read("app/layout.tsx"), /vercel=\{process\.env\.VERCEL === "1"\}/);
  const gate = read("components/analytics/analytics-gate.tsx");
  assert.match(gate, /vercel\s*=\s*false/);
  assert.match(gate, /\{vercel && \(/);
  assert.ok(gate.indexOf("{vercel && (") < gate.indexOf("<Analytics"), "<Analytics> sits inside the vercel guard");
  assert.ok(gate.indexOf("<SpeedInsights") < gate.indexOf("<PostHogProvider"), "SpeedInsights is inside the guard, PostHog is not");
});
