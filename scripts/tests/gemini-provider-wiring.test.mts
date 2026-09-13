import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * WP-1 end to end through the REAL generateStructured, with the Google SDK
 * replaced by a fake. The pure pieces are pinned in gemini-tuning.test.ts and
 * gemini-hedged-call.test.ts; this file proves they are the ones actually wired
 * into the request the model receives and into the retry ladder around it:
 *
 *   • with no env set, the request carries thinkingBudget 256 and the hedge is
 *     armed at 12s; the documented rollback values reach the request;
 *   • with ONE key (local dev), or without room left in the step, a call slower
 *     than the hedge delay still makes exactly one request;
 *   • with TWO keys the same slow call is hedged onto the other key, which wins,
 *     the loser is aborted, and the metered row says it was hedged;
 *   • a hedge can't make the ladder worse: a failing hedge key doesn't get its
 *     error pinned on the primary key, and an empty hedge answer doesn't abort a
 *     good primary;
 *   • one model refusing the thinking budget doesn't unbound the others.
 *
 * Env is read at module load, so each case re-imports with a cache-buster.
 * Requires Node's experimental module mocking — see the `test` npm script.
 */

const geminiPath = resolve(import.meta.dirname, "../../ai/providers/gemini.ts");

type Req = {
  model: string;
  config: { thinkingConfig?: unknown; abortSignal?: AbortSignal; maxOutputTokens?: number };
};
type Behaviour = (apiKey: string, signal: AbortSignal | undefined, req: Req) => Promise<unknown>;

const OK = {
  text: JSON.stringify({ ok: true }),
  candidates: [{ finishReason: "STOP" }],
  usageMetadata: {},
};

let calls: { apiKey: string; model: string; config: Req["config"] }[] = [];
let usage: { meta?: Record<string, unknown> }[] = [];
let behaviour: Behaviour = async () => OK;

class FakeGoogleGenAI {
  models: { generateContent: (req: Req) => Promise<unknown> };
  constructor({ apiKey }: { apiKey: string }) {
    this.models = {
      generateContent: (req: Req) => {
        calls.push({ apiKey, model: req.model, config: req.config });
        return behaviour(apiKey, req.config.abortSignal, req);
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

// Metering is fire-and-forget into Supabase; capture the rows instead.
mock.module(pathToFileURL(resolve(import.meta.dirname, "../../lib/usage/meter.ts")).href, {
  exports: {
    recordUsage: (rec: { meta?: Record<string, unknown> }) => {
      usage.push(rec);
    },
  },
});

const TUNING_VARS = [
  "GEMINI_HEDGE_AFTER_MS",
  "GEMINI_THINKING_BUDGET",
  "GEMINI_CALL_CAP_MS",
  "GEMINI_MODEL",
  "GEMINI_MODEL_FAST",
  "GEMINI_MODEL_STABLE",
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

function run(mod: GeminiModule, opts: { deadlineAt?: number; fast?: boolean } = {}) {
  calls = [];
  usage = [];
  return mod.geminiProvider.generateStructured<{ ok: boolean }>(
    {
      name: "probe",
      description: "probe",
      schema: { type: "object", properties: { ok: { type: "boolean" } } },
    },
    { system: "probe", parts: [{ text: "probe" }], ...opts },
  );
}

const abortError = () =>
  Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

/** Settle after `ms` with `outcome`, unless the request is aborted first. */
function after(
  ms: number,
  signal: AbortSignal | undefined,
  outcome: { value: unknown } | { error: Error } = { value: OK },
): Promise<unknown> {
  return new Promise((res, rej) => {
    const t = setTimeout(
      () => ("error" in outcome ? rej(outcome.error) : res(outcome.value)),
      ms,
    );
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        rej(abortError());
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
  assert.equal(calls[0].model, "gemini-2.5-flash", "the model floor is unchanged");
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
  behaviour = (_key, signal) => after(2_400, signal);
  assert.deepEqual(await run(mod), { ok: true });
  assert.equal(calls.length, 1, "with a single key the hedge must switch itself off");
  assert.equal(usage.length, 1);
  assert.equal(usage[0].meta?.hedged, undefined, "an un-hedged call is metered as before");
});

test("two keys but no room left in the step: no hedge", async () => {
  // The hedge needs its delay + one full call (8s) of budget. 9.5s left < 10s.
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_API_KEY_2: "k2",
    GEMINI_HEDGE_AFTER_MS: "2000",
  });
  behaviour = (_key, signal) => after(2_400, signal);
  assert.deepEqual(await run(mod, { deadlineAt: Date.now() + 9_500 }), { ok: true });
  assert.equal(calls.length, 1, "a hedge that can't finish inside the step must not start");
});

test("two keys: the same slow call is hedged onto the OTHER key, which wins", async () => {
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_API_KEY_2: "k2",
    GEMINI_HEDGE_AFTER_MS: "2000",
  });
  behaviour = (key, signal) => after(key === "k1" ? 10_000 : 20, signal);
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
  // The loser is invisible in usage_events (no usage metadata comes back), so
  // the winner's row is the only place the hedge's extra cost can be counted.
  assert.equal(usage.length, 1, "still one metered row per answer used");
  assert.deepEqual(usage[0].meta, { hedged: true, hedges: 1 }, "the metered row must say a hedge fired");
});

test("REGRESSION: a hedge key's 429 is not pinned on the primary key", async () => {
  // Primary k1 is merely overloaded (503); the hedge key k2 is out of quota
  // (429) and answers first. Un-hedged, the ladder backs off 4s and k1 answers
  // on the paid model. The hedge must not turn that into "k1 cooled down, k2
  // retried, every key rate-limited, audit handed to the fast model".
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_API_KEY_2: "k2",
    GEMINI_HEDGE_AFTER_MS: "2000",
  });
  let k1Calls = 0;
  behaviour = (key, signal) => {
    if (key === "k2") {
      return after(100, signal, { error: new Error("429 RESOURCE_EXHAUSTED: quota exceeded") });
    }
    return k1Calls++ === 0
      ? after(2_500, signal, { error: new Error('{"code": 503, "status": "UNAVAILABLE"}') })
      : after(50, signal);
  };
  assert.deepEqual(await run(mod, { deadlineAt: Date.now() + 30_000 }), { ok: true });
  assert.deepEqual(
    [...new Set(calls.map((c) => c.model))],
    ["gemini-2.5-flash"],
    "the paid audit must be answered by the paid model, not the fallback",
  );
  assert.equal(k1Calls, 2, "k1 is retried after its 503 back-off");
  // The answer came from an un-hedged retry, but a hedge was paid for on the
  // way. Counting only the winning call's hedge would hide exactly the hedges
  // that went badly.
  assert.deepEqual(usage[0].meta, { hedged: true, hedges: 1 });
});

test("REGRESSION: a truncated primary goes straight to the wider retry, without waiting for the hedge", async () => {
  // The hedge shares the primary's 8192 ceiling, so it would truncate too.
  // Un-fixed, this waits for the 6s hedge draw (~8s total) before the wider
  // retry; with a deadline in play that is how a completable call fails.
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_API_KEY_2: "k2",
    GEMINI_HEDGE_AFTER_MS: "2000",
  });
  const TRUNCATED = {
    text: '{"ok": tr',
    candidates: [{ finishReason: "MAX_TOKENS" }],
    usageMetadata: {},
  };
  let k1Calls = 0;
  behaviour = (key, signal) => {
    if (key === "k2") return after(6_000, signal, { value: TRUNCATED });
    return k1Calls++ === 0 ? after(2_500, signal, { value: TRUNCATED }) : after(50, signal);
  };
  const started = Date.now();
  assert.deepEqual(await run(mod), { ok: true });
  const took = Date.now() - started;
  assert.ok(took < 4_500, `the wider retry must not wait for the hedge (took ${took}ms)`);
  assert.deepEqual(
    calls.map((c) => c.apiKey),
    ["k1", "k2", "k1"],
    "primary, hedge, then the primary key's wider retry",
  );
  assert.equal(calls[1].config.abortSignal?.aborted, true, "the hedge is aborted");
  assert.equal(calls[2].config.maxOutputTokens, 16_384, "the retry widens the ceiling");
});

test("REGRESSION: an empty hedge answer does not abort a good primary", async () => {
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_API_KEY_2: "k2",
    GEMINI_HEDGE_AFTER_MS: "2000",
  });
  const EMPTY = { text: "", candidates: [{ finishReason: "STOP" }], usageMetadata: {} };
  behaviour = (key, signal) =>
    key === "k1" ? after(3_000, signal) : after(100, signal, { value: EMPTY });
  const started = Date.now();
  assert.deepEqual(await run(mod), { ok: true });
  const took = Date.now() - started;
  assert.equal(calls.length, 2, "no third request: the primary's answer is used");
  // Un-fixed this takes ~6.6s (abort at 2.1s + 1.5s back-off + a fresh 3s
  // call); the margin absorbs a loaded test runner.
  assert.ok(took < 5_500, `the good primary must not be thrown away (took ${took}ms)`);
});

test("one model refusing the thinking budget does not unbound the others", async () => {
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_MODEL: "m-premium",
    GEMINI_MODEL_FAST: "m-fast",
    GEMINI_MODEL_STABLE: "m-stable",
  });
  behaviour = async (_key, _signal, req) => {
    if (req.model === "m-fast" && req.config.thinkingConfig) {
      // Verbatim from a live gemini-2.5-flash-lite call with thinkingBudget 256
      // (2026-09-13): that model's floor is 512.
      throw new Error(
        '{"error":{"code":400,"message":"The thinking budget 256 is invalid. Please choose a value between 512 and 24576.","status":"INVALID_ARGUMENT"}}',
      );
    }
    return OK;
  };
  assert.deepEqual(await run(mod, { fast: true }), { ok: true });
  assert.equal(calls.length, 2, "one retry without the config, on the model that refused it");
  assert.equal(calls[1].config.thinkingConfig, undefined);

  assert.deepEqual(await run(mod), { ok: true });
  assert.equal(calls[0].model, "m-premium");
  assert.deepEqual(
    calls[0].config.thinkingConfig,
    { thinkingBudget: 256 },
    "the premium vision call must keep its bound",
  );
});
