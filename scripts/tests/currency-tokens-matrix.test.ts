import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveMoneyTokens } from "../../lib/currency/tokens";

const root = join(import.meta.dirname, "..", "..", "lib", "i18n");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

const usd = { code: "USD", rate: 1, locale: "en" as const };
const mxn = { code: "MXN", rate: 18, locale: "en" as const };
const ars = { code: "ARS", rate: 1000, locale: "en" as const };
const cop = { code: "COP", rate: 4000, locale: "es" as const };
const TOKEN = /\{(?:price|uprice|est|estr):[^}]*\}/g;

test("every token in every dictionary resolves in USD, MXN, COP, ARS and with no context", () => {
  const raw = [read("dict", "ui-en.json"), read("dict", "ui-es.json"), read("messages.ts")].join("\n");
  const tokens = raw.match(TOKEN) ?? [];
  assert.ok(tokens.length >= 25, `found ${tokens.length} tokens`);
  for (const tok of tokens) {
    for (const ctx of [null, usd, mxn, ars, cop]) {
      const out = resolveMoneyTokens(tok, ctx);
      assert.doesNotMatch(out, /\{(price|uprice|est|estr):/, tok);
      assert.ok(out.length > 0 && !/NaN|undefined/.test(out), `${tok} → ${out}`);
    }
  }
});

test("a visitor whose currency also uses $ never reads a bare $ for a USD price", () => {
  for (const tok of ["{price:19}", "{price:7}", "{uprice:7}"]) {
    for (const ctx of [mxn, ars]) assert.match(resolveMoneyTokens(tok, ctx), /^(US\$|≈)/, `${tok} ${ctx.code}`);
  }
});

test("EN and ES messages.ts carry the same number of tokens of each kind", () => {
  const src = read("messages.ts");
  const half = src.indexOf("\nconst es: Dict");
  assert.ok(half > 0);
  const en = src.slice(0, half);
  const es = src.slice(half, src.indexOf("export const messages"));
  for (const kind of ["price", "uprice", "est", "estr"]) {
    const re = new RegExp(`\\{${kind}:`, "g");
    assert.equal((en.match(re) ?? []).length, (es.match(re) ?? []).length, kind);
  }
});

test("EN and ES JSON dictionaries carry the same money tokens per key", () => {
  const flat = (o: unknown, p = "", out: Record<string, string> = {}) => {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string") out[p + k] = v;
      else if (v && typeof v === "object") flat(v, `${p}${k}.`, out);
    }
    return out;
  };
  const en = flat(JSON.parse(read("dict", "ui-en.json")));
  const es = flat(JSON.parse(read("dict", "ui-es.json")));
  for (const [key, val] of Object.entries(es)) {
    const toks = (s: string) => (s.match(TOKEN) ?? []).map((t) => t.replace(/\|.*\}/, "}")).sort();
    if (key in en) assert.deepEqual(toks(val), toks(en[key]), key);
  }
});
