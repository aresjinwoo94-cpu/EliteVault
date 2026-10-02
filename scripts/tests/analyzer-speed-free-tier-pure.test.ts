import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveInngestServeHost } from "../../lib/inngest-serve-host";
import {
  buildAnalysisTimings,
  persistAnalysisTimings,
  unwrapAnalyzerStep,
} from "../../lib/analyzer/timings";
import { runWithMeter, getMeterContext, enterMeter } from "../../lib/usage/context";

/**
 * docs/analyzer-speed-fix-free-tier.md — the pure halves of Paquetes A and D.
 * The provider behaviour (503 skip, model switch, usage meta) is pinned in
 * analyzer-speed-free-tier.test.mts, which needs module mocks.
 */

// ─── Paquete A: serveHost only in production ────────────────────────────────

test("serveHost: production pins the stable domain", () => {
  assert.equal(
    resolveInngestServeHost({
      VERCEL_ENV: "production",
      INNGEST_SERVE_HOST: "https://elitevaultapp.com",
    }),
    "https://elitevaultapp.com",
  );
  // A trailing slash or path is normalised to the origin the SDK expects.
  assert.equal(
    resolveInngestServeHost({
      VERCEL_ENV: "production",
      INNGEST_SERVE_HOST: " https://elitevaultapp.com/ ",
    }),
    "https://elitevaultapp.com",
  );
});

test("serveHost: preview and local keep the SDK default, even with the var set", () => {
  for (const VERCEL_ENV of ["preview", "development", undefined]) {
    assert.equal(
      resolveInngestServeHost({ VERCEL_ENV, INNGEST_SERVE_HOST: "https://elitevaultapp.com" }),
      undefined,
      `VERCEL_ENV=${VERCEL_ENV}`,
    );
  }
});

test("serveHost: production without the var, or with garbage, changes nothing", () => {
  assert.equal(resolveInngestServeHost({ VERCEL_ENV: "production" }), undefined);
  assert.equal(
    resolveInngestServeHost({ VERCEL_ENV: "production", INNGEST_SERVE_HOST: "   " }),
    undefined,
  );
  assert.equal(
    resolveInngestServeHost({ VERCEL_ENV: "production", INNGEST_SERVE_HOST: "elitevaultapp.com" }),
    undefined,
    "a bare host isn't an absolute URL — ignored rather than building broken callbacks",
  );
  assert.equal(
    resolveInngestServeHost({ VERCEL_ENV: "production", INNGEST_SERVE_HOST: "ftp://x.com" }),
    undefined,
  );
});

test("the Inngest route passes serveHost through the guard, and nothing else changed", () => {
  const src = readFileSync(
    resolve(import.meta.dirname, "../../app/api/inngest/route.ts"),
    "utf8",
  );
  assert.match(src, /serveHost:\s*resolveInngestServeHost\(process\.env\)/);
  assert.match(src, /export const maxDuration = 60;/, "Hobby ceiling untouched");
  assert.match(src, /streaming: "allow"/);
});

// ─── Paquete D: timings never break the save ────────────────────────────────

test("persistAnalysisTimings: a missing column (0034 not applied) returns false, never throws", async () => {
  const service = {
    from: () => ({
      update: () => ({
        eq: async () => ({ error: { message: 'column "timings" does not exist' } }),
      }),
    }),
  };
  const t = buildAnalysisTimings({ vision: null, saveMs: 5, runStartedAtMs: Date.now() - 1000 });
  assert.equal(await persistAnalysisTimings(service, "a1", t), false);
});

test("persistAnalysisTimings: a throwing client returns false, never rejects", async () => {
  const boom = {
    from: () => {
      throw new Error("network down");
    },
  };
  const t = buildAnalysisTimings({ vision: null, saveMs: 5, runStartedAtMs: Date.now() });
  assert.equal(await persistAnalysisTimings(boom, "a1", t), false);
  assert.equal(await persistAnalysisTimings(null, "a1", t), false);
});

test("persistAnalysisTimings: writes only the timings column, by id", async () => {
  let row: Record<string, unknown> | null = null;
  let where: [string, string] | null = null;
  const service = {
    from: (table: string) => {
      assert.equal(table, "analyses");
      return {
        update: (r: Record<string, unknown>) => {
          row = r;
          return {
            eq: async (c: string, v: string) => {
              where = [c, v];
              return { error: null };
            },
          };
        },
      };
    },
  };
  const t = buildAnalysisTimings({ vision: null, saveMs: 1, runStartedAtMs: Date.now() });
  assert.equal(await persistAnalysisTimings(service, "a1", t), true);
  assert.deepEqual(Object.keys(row!), ["timings"], "never touches status/result/credits");
  assert.deepEqual(where, ["id", "a1"]);
});

test("buildAnalysisTimings: shape and tolerance of missing/garbage inputs", () => {
  const t = buildAnalysisTimings({
    capture: { ms: 6123.4, cached: false },
    vision: { visionMs: 21000, attempt: 2, model: "m", hedged: true, fellBackFrom: "p", modelSwitched: true },
    saveMs: 80,
    runStartedAtMs: 1_000,
    now: 41_000,
  });
  assert.deepEqual(t, {
    v: 1,
    captureMs: 6123,
    captureCached: false,
    visionMs: 21000,
    saveMs: 80,
    totalMs: 40_000,
    model: "m",
    attempts: { vision: 2 },
    hedged: true,
    fellBackFrom: "p",
    modelSwitched: true,
  });
  const empty = buildAnalysisTimings({
    capture: { ms: "x" as unknown, cached: "no" as unknown },
    vision: null,
    saveMs: Number.NaN,
    runStartedAtMs: 0,
    now: 10,
  });
  assert.equal(empty.captureMs, null);
  assert.equal(empty.captureCached, null);
  assert.equal(empty.visionMs, null);
  assert.equal(empty.model, null);
  assert.equal(empty.saveMs, 0);
  assert.equal(empty.modelSwitched, false);
});

test("unwrapAnalyzerStep: new { audit, timing } shape and the OLD memoized bare audit", () => {
  const audit = { score: 60, summary: "s" };
  const timing = { visionMs: 1, attempt: 1 };
  assert.deepEqual(unwrapAnalyzerStep({ audit, timing }), { audit, timing });
  // A run in flight across the deploy replays the previous output: the audit itself.
  assert.deepEqual(unwrapAnalyzerStep(audit), { audit, timing: null });
});

test("save-result writes timings AFTER the succeeded update, through the never-throwing helper", () => {
  const src = readFileSync(
    resolve(import.meta.dirname, "../../inngest/functions/analyze-website.ts"),
    "utf8",
  );
  const save = src.slice(src.indexOf('step.run("save-result"'));
  const succeeded = save.indexOf('status: "succeeded"');
  const timings = save.indexOf("persistAnalysisTimings(");
  assert.ok(succeeded > 0 && timings > succeeded, "timings must be written after the result");
  assert.doesNotMatch(
    save.slice(0, timings),
    /timings[,:]/,
    "timings must not ride in the same update as the result",
  );
});

// ─── Paquete D: the meter keeps the analysisId inside steps ────────────────

test("REGRESSION: a callback scheduled outside the handler's context loses enterWith — runWithMeter restores it", async () => {
  // How Inngest runs step.run bodies: from promise reactions registered by its
  // own scheduler, i.e. OUTSIDE the async context the handler entered.
  let schedule!: (fn: () => unknown) => void;
  const scheduler = new Promise<() => unknown>((r) => (schedule = r));
  const ran = scheduler.then((fn) => fn()); // registered BEFORE the handler runs

  const ctx = { eventType: "analysis", meta: { analysisId: "a-123" } };
  const seen: Array<string | undefined> = [];
  await (async () => {
    enterMeter(ctx); // what the handler does at its top
    schedule(() => {
      seen.push(getMeterContext()?.eventType); // the old step body
      return runWithMeter(ctx, async () => {
        seen.push((getMeterContext()?.meta as { analysisId?: string })?.analysisId);
      });
    });
  })();
  await ran;
  assert.deepEqual(seen, [undefined, "a-123"], "enterWith is lost; runWithMeter carries it");
});

test("every analyze-website step that calls an AI provider re-enters the meter", () => {
  const src = readFileSync(
    resolve(import.meta.dirname, "../../inngest/functions/analyze-website.ts"),
    "utf8",
  );
  for (const step of ["quick-score", "run-analyzer-agent", "run-meta-ads-agent", "match-niche-winners"]) {
    assert.match(
      src,
      new RegExp(`step\\.run\\("${step}", metered\\(`),
      `${step} must run inside runWithMeter (event_type 'analysis' + analysisId)`,
    );
  }
});
