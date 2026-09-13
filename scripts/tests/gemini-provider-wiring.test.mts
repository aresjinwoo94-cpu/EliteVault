import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * WP-1 end to end through the REAL generateStructured, with the Google SDK
 * replaced by a fake. The pure pieces are pinned in gemini-tuning.test.ts and
 * gemini-hedged-call.test.ts; this file proves they are the ones actually wired
 * into the request the model receives:
 *
 *   • with no env set, the request carries thinkingBudget 256 and the hedge is
 *     armed at 12s;
 *   • the documented rollback values reach the request;
 *   • with ONE key (local dev) a call slower than the hedge delay still makes
 *     exactly one request — the hedge switches itself off;
 *   • with TWO keys the same slow call is hedged onto the other key, which wins,
 *     and the loser is aborted (the control that proves the one-key case could
 *     have failed).
 *
 * Env is read at module load, so each case re-imports with a cache-buster.
 * Requires Node's experimental module mocking — see the `test` npm script.
 */

const geminiPath = resolve(import.meta.dirname, "../../ai/providers/gemini.ts");

type Req = { config: { thinkingConfig?: unknown; abortSignal?: AbortSignal } };
type Behaviour = (apiKey: string, signal: AbortSignal | undefined) => Promise<unknown>;

const OK = {
  text: JSON.stringify({ ok: true }),
  candidates: [{ finishReason: "STOP" }],
  usageMetadata: {},
};

let calls: { apiKey: string; config: Req["config"] }[] = [];
let behaviour: Behaviour = async () => OK;

class FakeGoogleGenAI {
  models: { generateContent: (req: Req) => Promise<unknown> };
  constructor({ apiKey }: { apiKey: string }) {
    this.models = {
      generateContent: (req: Req) => {
        calls.push({ apiKey, config: req.config });
        return behaviour(apiKey, req.config.abortSignal);
      },
    };
  }
}

const genaiExports = {
  GoogleGenAI: FakeGoogleGenAI,
  Type: {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    NUMBER: "NUMBER",
    INTEGER: "INTEGER",
    BOOLEAN: "BOOLEAN",
  },
};

// The SDK ships separate ESM and CJS entry points, and the provider may load
// through either, so mock every URL the specifier can resolve to.
const genaiUrls = new Set<string>([
  import.meta.resolve("@google/genai"),
  pathToFileURL(createRequire(geminiPath).resolve("@google/genai")).href,
]);
for (const url of genaiUrls) mock.module(url, { exports: genaiExports });

// Metering is fire-and-forget into Supabase; keep it out of a unit test.
mock.module(pathToFileURL(resolve(import.meta.dirname, "../../lib/usage/meter.ts")).href, {
  exports: { recordUsage: () => {} },
});

const TUNING_VARS = [
  "GEMINI_HEDGE_AFTER_MS",
  "GEMINI_THINKING_BUDGET",
  "GEMINI_API_KEY",
  ...Array.from({ length: 9 }, (_, i) => `GEMINI_API_KEY_${i + 2}`),
];

type GeminiModule = typeof import("../../ai/providers/gemini");

let loads = 0;
async function loadGemini(env: Record<string, string>): Promise<GeminiModule> {
  const saved = new Map(TUNING_VARS.map((k) => [k, process.env[k]]));
  for (const k of TUNING_VARS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    return (await import(`../../ai/providers/gemini?wiring=${++loads}`)) as GeminiModule;
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function run(mod: GeminiModule) {
  calls = [];
  return mod.geminiProvider.generateStructured<{ ok: boolean }>(
    {
      name: "probe",
      description: "probe",
      schema: { type: "object", properties: { ok: { type: "boolean" } } },
    },
    { system: "probe", parts: [{ text: "probe" }] },
  );
}

/** Answer after `ms`, unless the request is aborted first. */
function answerAfter(ms: number, signal: AbortSignal | undefined): Promise<unknown> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => res(OK), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        rej(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

test("defaults: thinking bounded at 256 and hedge armed at 12s", async () => {
  const mod = await loadGemini({ GEMINI_API_KEY: "k1" });
  behaviour = async () => OK;
  assert.deepEqual(await run(mod), { ok: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].config.thinkingConfig, { thinkingBudget: 256 });
  assert.equal(mod.GEMINI_TUNING_FOR_TEST.hedgeAfterMs, 12_000);
  assert.equal(mod.GEMINI_TUNING_FOR_TEST.thinkingBudget, 256);
});

test("rollback values reach the request without a code change", async () => {
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_THINKING_BUDGET: "512",
    GEMINI_HEDGE_AFTER_MS: "0",
  });
  behaviour = async () => OK;
  await run(mod);
  assert.deepEqual(calls[0].config.thinkingConfig, { thinkingBudget: 512 });
  assert.equal(mod.GEMINI_TUNING_FOR_TEST.hedgeAfterMs, 0);
});

test("one key: a call slower than the hedge delay makes exactly ONE request", async () => {
  const mod = await loadGemini({ GEMINI_API_KEY: "k1", GEMINI_HEDGE_AFTER_MS: "2000" });
  behaviour = (_key, signal) => answerAfter(2_400, signal);
  assert.deepEqual(await run(mod), { ok: true });
  assert.equal(calls.length, 1, "with a single key the hedge must switch itself off");
});

test("two keys: the same slow call is hedged onto the OTHER key, which wins", async () => {
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_API_KEY_2: "k2",
    GEMINI_HEDGE_AFTER_MS: "2000",
  });
  behaviour = (key, signal) => answerAfter(key === "k1" ? 10_000 : 20, signal);
  const started = Date.now();
  assert.deepEqual(await run(mod), { ok: true });
  const took = Date.now() - started;
  assert.equal(calls.length, 2, "the hedge should have fired");
  assert.deepEqual(
    calls.map((c) => c.apiKey),
    ["k1", "k2"],
    "the hedge must go to a DIFFERENT key",
  );
  assert.ok(took < 5_000, `should not have waited for the slow key (took ${took}ms)`);
  assert.equal(calls[0].config.abortSignal?.aborted, true, "the losing call must be aborted");
});
