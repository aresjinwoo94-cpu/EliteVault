import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * docs/analyzer-speed-fix-free-tier.md §4 (Paquete C) through the REAL
 * generateStructured, with the Google SDK replaced by a fake (same harness as
 * gemini-provider-wiring.test.mts):
 *
 *   • a 503 "high demand" jumps straight to the next model — no 4s back-off on
 *     the saturated model and no trying its other keys;
 *   • the last model of the chain keeps its one same-model 503 retry;
 *   • the model switch races the next model when the primary is slow, keeps the
 *     first ACCEPTED answer, aborts the loser, and stays off unless asked;
 *   • the metered row says which model answered, how long it took, and what it
 *     fell back from (Paquete D).
 */

const geminiPath = resolve(import.meta.dirname, "../../ai/providers/gemini.ts");

type Req = { model: string; config: { abortSignal?: AbortSignal; thinkingConfig?: unknown } };
type Behaviour = (apiKey: string, signal: AbortSignal | undefined, req: Req) => Promise<unknown>;

const ok = (body: unknown = { ok: true }) => ({
  text: JSON.stringify(body),
  candidates: [{ finishReason: "STOP" }],
  usageMetadata: {},
});

let calls: { apiKey: string; model: string; config: Req["config"] }[] = [];
let usage: { model?: string; meta?: Record<string, unknown> }[] = [];
let behaviour: Behaviour = async () => ok();

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
  Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", NUMBER: "NUMBER", INTEGER: "INTEGER", BOOLEAN: "BOOLEAN" },
};
for (const url of new Set<string>([
  import.meta.resolve("@google/genai"),
  pathToFileURL(createRequire(geminiPath).resolve("@google/genai")).href,
])) {
  mock.module(url, { exports: genaiExports });
}
mock.module(pathToFileURL(resolve(import.meta.dirname, "../../lib/usage/meter.ts")).href, {
  exports: {
    recordUsage: (rec: { model?: string; meta?: Record<string, unknown> }) => {
      usage.push(rec);
    },
  },
});

const VARS = [
  "GEMINI_HEDGE_AFTER_MS",
  "GEMINI_THINKING_BUDGET",
  "GEMINI_THINKING_BUDGET_BY_MODEL",
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
  const saved = new Map(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    return (await import(`../../ai/providers/gemini?speed=${++loads}`)) as GeminiModule;
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Premium → fast → stable, two keys, no hedge (so each model call is one request). */
const CHAIN = {
  GEMINI_API_KEY: "k1",
  GEMINI_API_KEY_2: "k2",
  GEMINI_HEDGE_AFTER_MS: "0",
  GEMINI_MODEL: "m-premium",
  GEMINI_MODEL_FAST: "m-fast",
  GEMINI_MODEL_STABLE: "m-stable",
};

function run(
  mod: GeminiModule,
  opts: Partial<import("../../ai/provider").GenerateOptions> = {},
) {
  calls = [];
  usage = [];
  return mod.geminiProvider.generateStructured<Record<string, unknown>>(
    { name: "probe", description: "probe", schema: { type: "object", properties: { ok: { type: "boolean" } } } },
    { system: "probe", parts: [{ text: "probe" }], ...opts },
  );
}

const abortError = () => Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
function after(ms: number, signal: AbortSignal | undefined, outcome: { value: unknown } | { error: Error } = { value: ok() }) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => ("error" in outcome ? rej(outcome.error) : res(outcome.value)), ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(abortError());
    }, { once: true });
  });
}
const HIGH_DEMAND = () =>
  new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary.","status":"UNAVAILABLE"}}');

// ─── 503 → next model at once ───────────────────────────────────────────────

test('503 "high demand" jumps to the next model at once: no same-model retry, no other keys', async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal, req) =>
    req.model === "m-premium" ? after(30, signal, { error: HIGH_DEMAND() }) : after(30, signal);
  const started = Date.now();
  assert.deepEqual(await run(mod, { deadlineAt: Date.now() + 50_000 }), { ok: true });
  const took = Date.now() - started;
  assert.deepEqual(calls.map((c) => c.model), ["m-premium", "m-fast"]);
  assert.ok(took < 2_000, `no 4s back-off on the saturated model (took ${took}ms)`);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].model, "m-fast", "the row names the model that ANSWERED");
  assert.equal(usage[0].meta?.model, "m-fast");
  assert.equal(usage[0].meta?.fellBackFrom, "m-premium");
  assert.equal(usage[0].meta?.hedged, false);
  assert.equal(typeof usage[0].meta?.latencyMs, "number");
});

test("the LAST model of the chain keeps its one same-model 503 retry (nowhere else to go)", async () => {
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_HEDGE_AFTER_MS: "0",
    GEMINI_MODEL: "m-only",
    GEMINI_MODEL_FAST: "m-only",
    GEMINI_MODEL_STABLE: "m-only",
  });
  let n = 0;
  behaviour = (_k, signal) => (n++ === 0 ? after(20, signal, { error: HIGH_DEMAND() }) : after(20, signal));
  assert.deepEqual(await run(mod, { deadlineAt: Date.now() + 50_000 }), { ok: true });
  assert.deepEqual(calls.map((c) => c.model), ["m-only", "m-only"]);
});

// ─── model switch ───────────────────────────────────────────────────────────

test("model switch: a slow primary races the next model, which wins; the primary is aborted", async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal, req) =>
    req.model === "m-premium" ? after(10_000, signal) : after(50, signal, { value: ok({ ok: "fast" }) });
  let info: { model?: string; modelSwitched?: boolean; fellBackFrom?: string } | null = null;
  const started = Date.now();
  const out = await run(mod, {
    deadlineAt: Date.now() + 50_000,
    modelSwitchAfterMs: 300,
    onAnswer: (i) => {
      info = i;
    },
  });
  const took = Date.now() - started;
  assert.deepEqual(out, { ok: "fast" });
  assert.ok(took < 2_000, `answered by the switched model (took ${took}ms)`);
  assert.deepEqual(calls.map((c) => c.model), ["m-premium", "m-fast"]);
  assert.equal(calls[0].config.abortSignal?.aborted, true, "the losing primary is aborted");
  assert.deepEqual(
    { model: info!.model, modelSwitched: info!.modelSwitched, fellBackFrom: info!.fellBackFrom },
    { model: "m-fast", modelSwitched: true, fellBackFrom: "m-premium" },
    "onAnswer describes the RETURNED answer",
  );
  assert.equal(usage.at(-1)?.meta?.modelSwitched, true);
});

test("model switch: only an ACCEPTED answer wins — a fast malformed draw doesn't beat a correct one", async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal, req) =>
    req.model === "m-premium"
      ? after(900, signal, { value: ok({ ok: "premium" }) })
      : after(20, signal, { value: ok({ bad: true }) });
  const out = await run(mod, {
    deadlineAt: Date.now() + 50_000,
    modelSwitchAfterMs: 300,
    accept: (r) => typeof (r as { ok?: unknown }).ok === "string",
  });
  assert.deepEqual(out, { ok: "premium" });
});

test("model switch: if NO side is accepted, the primary's answer is still returned (repair pass can use it)", async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal, req) =>
    req.model === "m-premium"
      ? after(700, signal, { value: ok({ who: "premium" }) })
      : after(20, signal, { value: ok({ who: "fast" }) });
  const out = await run(mod, { deadlineAt: Date.now() + 50_000, modelSwitchAfterMs: 300, accept: () => false });
  assert.deepEqual(out, { who: "premium" });
});

test("model switch is OFF unless the caller asks for it", async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal) => after(800, signal);
  assert.deepEqual(await run(mod, { deadlineAt: Date.now() + 50_000 }), { ok: true });
  assert.deepEqual(calls.map((c) => c.model), ["m-premium"], "no parallel model without modelSwitchAfterMs");
  await run(mod, { deadlineAt: Date.now() + 50_000, modelSwitchAfterMs: 0 });
  assert.deepEqual(calls.map((c) => c.model), ["m-premium"], "0 = off");
});

test("model switch doesn't start without room for a full call left in the step", async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal) => after(1_200, signal);
  // 8.5s budget: the primary may start (needs 8s), but at 700ms only ~7.8s is
  // left — a switched call couldn't finish, so it must not be started.
  await run(mod, { deadlineAt: Date.now() + 8_500, modelSwitchAfterMs: 700 });
  assert.deepEqual(calls.map((c) => c.model), ["m-premium"]);
});

test("a primary that FAILS before the switch falls back once, sequentially — the timer can't start a second copy", async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal, req) =>
    req.model === "m-premium" ? after(30, signal, { error: HIGH_DEMAND() }) : after(600, signal);
  assert.deepEqual(
    await run(mod, { deadlineAt: Date.now() + 50_000, modelSwitchAfterMs: 300 }),
    { ok: true },
  );
  await new Promise((r) => setTimeout(r, 400)); // past the switch delay
  assert.deepEqual(calls.map((c) => c.model), ["m-premium", "m-fast"]);
});

test("a caller cancel aborts both racers", async () => {
  const mod = await loadGemini(CHAIN);
  behaviour = (_k, signal) => after(10_000, signal);
  const ctl = new AbortController();
  const p = run(mod, { deadlineAt: Date.now() + 50_000, modelSwitchAfterMs: 200, signal: ctl.signal });
  await new Promise((r) => setTimeout(r, 400));
  ctl.abort();
  await assert.rejects(p);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.config.abortSignal?.aborted), "no orphan generation keeps running");
});

// ─── thinking budget 0 on a model that can't disable thinking ──────────────

test("REGRESSION: a bare 400 INVALID_ARGUMENT for thinkingBudget 0 self-heals instead of failing the model", async () => {
  const mod = await loadGemini({
    GEMINI_API_KEY: "k1",
    GEMINI_HEDGE_AFTER_MS: "0",
    GEMINI_THINKING_BUDGET: "0",
    GEMINI_MODEL: "gemini-3.5-flash-lite",
    GEMINI_MODEL_FAST: "m-fast",
    GEMINI_MODEL_STABLE: "m-stable",
  });
  behaviour = async (_k, _s, req) => {
    if (req.config.thinkingConfig) {
      // Verbatim from scripts/benchmark-vision-models.mts, 2026-10-01.
      throw new Error('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}');
    }
    return ok();
  };
  assert.deepEqual(await run(mod, { deadlineAt: Date.now() + 50_000 }), { ok: true });
  assert.deepEqual(calls.map((c) => c.model), ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite"]);
  assert.equal(calls[1].config.thinkingConfig, undefined);
});

test("isThinkingRejection: generic 400 only counts when the budget sent was 0", async () => {
  const mod = await loadGemini({ GEMINI_API_KEY: "k1" });
  const bare = '{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}';
  assert.equal(mod.isThinkingRejection(bare, 0), true);
  assert.equal(mod.isThinkingRejection(bare, 256), false, "a real bad request must still surface");
  assert.equal(mod.isThinkingRejection(bare, null), false);
  assert.equal(
    mod.isThinkingRejection("The thinking budget 256 is invalid. Please choose a value between 512 and 24576.", 256),
    true,
  );
});

test("GEMINI_THINKING_BUDGET_BY_MODEL: a per-model budget reaches that model only", async () => {
  const mod = await loadGemini({
    ...CHAIN,
    GEMINI_THINKING_BUDGET_BY_MODEL: "m-fast=0, junk, =5, m-x=abc",
  });
  behaviour = (_k, signal, req) =>
    req.model === "m-premium" ? after(20, signal, { error: HIGH_DEMAND() }) : after(20, signal);
  await run(mod, { deadlineAt: Date.now() + 50_000 });
  assert.deepEqual(calls[0].config.thinkingConfig, { thinkingBudget: 256 }, "unlisted → global");
  assert.deepEqual(calls[1].config.thinkingConfig, { thinkingBudget: 0 }, "listed → its own");
  assert.deepEqual(
    [...mod.parseThinkingBudgetByModel("a=0,b=512, c = -1 ,bad,=3,d=x,e=").entries()],
    [["a", 0], ["b", 512], ["c", -1]],
  );
});

// ─── analyzer wiring ────────────────────────────────────────────────────────

test("analyzer: model switch defaults to 25s, 0 turns it off, junk falls back", async () => {
  const { resolveModelSwitchAfterMs, ANALYZER_MODEL_SWITCH_AFTER_MS_FOR_TEST } = await import(
    "../../ai/agents/analyzer-agent"
  );
  assert.equal(resolveModelSwitchAfterMs(undefined), 25_000);
  assert.equal(resolveModelSwitchAfterMs(""), 25_000);
  assert.equal(resolveModelSwitchAfterMs("0"), 0);
  assert.equal(resolveModelSwitchAfterMs("20000"), 20_000);
  assert.equal(resolveModelSwitchAfterMs("100"), 5_000, "sub-5s is clamped up");
  assert.equal(resolveModelSwitchAfterMs("off"), 25_000);
  assert.equal(resolveModelSwitchAfterMs("-1"), 25_000);
  if (!process.env.ANALYZER_MODEL_SWITCH_AFTER_MS) {
    assert.equal(ANALYZER_MODEL_SWITCH_AFTER_MS_FOR_TEST, 25_000);
  }
});
