/**
 * Paquete B (docs/analyzer-speed-fix-free-tier.md §3) — which FREE Gemini model
 * answers the analyzer's vision call fastest, reliably, right now?
 *
 * Usage:
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server \
 *     scripts/benchmark-vision-models.mts
 *   # re-print the table from a previous run without calling anything:
 *   npx tsx ... scripts/benchmark-vision-models.mts --summarize <file.jsonl>
 *
 * NOT part of `npm test`: real Gemini calls over the network.
 *
 * # What it sends
 * The REAL vision call: ANALYZER_SYSTEM, buildAnalyzerUserMessage() with the
 * store's live discovery text, the stored production screenshot, the exact
 * Gemini schema (toGeminiSchema(ANALYSIS_TOOL_SCHEMA)), temperature 0.2, 8192
 * output tokens, and the thinking budget under test.
 *
 * # What it deliberately does NOT do
 * It calls the model DIRECTLY, one attempt per sample — no key rotation, no
 * hedge, no 503 retry, no model fallback. Those ladders are what production
 * wraps AROUND the model; mixing them in would time the ladder rather than the
 * model, and a 503 would be hidden behind a fallback to a different model. So
 * every 503/429 here is counted, not retried.
 *
 * Each attempt is aborted at the production step budget (50s): an answer that
 * takes longer is, in production, a step retry or a refund — not a slow audit.
 * `p50/p90 (all)` therefore counts an attempt that failed or timed out as "did
 * not answer within 50s", which is the number the step actually experiences.
 *
 * Calls are INTERLEAVED (round → store → models in shuffled order) so time-of-
 * day load on Google's side spreads across every model instead of biasing the
 * ones measured last.
 *
 * Env knobs:
 *   ENV_FILE           (default .env.local) — uses GEMINI_API_KEY only
 *   BENCH_MODELS       comma list (default: the free *-flash candidates below)
 *   BENCH_THINKING     comma list of budgets (default "256"; -1 = model default)
 *   BENCH_ARMS         exact "model:thinking" list, overrides the two above
 *   BENCH_REPEATS      rounds over every store (default 2)
 *   BENCH_GAP_MS       pause between calls (default 4000, stays under 15 RPM)
 *   BENCH_OUT          JSONL output path (default ./benchmark-vision-<ts>.jsonl)
 *   BENCH_SAMPLES_DIR  where to save each valid audit JSON for quality review
 */
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);

type Row = {
  model: string;
  thinking: number;
  store: string;
  round: number;
  ms: number;
  outcome: "ok" | "invalid" | "truncated" | "empty" | "503" | "429" | "timeout" | "error";
  outputTokens: number | null;
  thoughtTokens: number | null;
  promptTokens: number | null;
  thinkingDropped?: boolean;
  error?: string;
};

const STEP_MS = 50_000;

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}
const median = (xs: number[]) => pct([...xs].sort((a, b) => a - b), 0.5);
const fmtS = (ms: number) =>
  Number.isNaN(ms) ? "—" : ms >= STEP_MS ? ">50s" : `${(ms / 1000).toFixed(1)}s`;

function summarize(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.model}|${r.thinking}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const lines: string[] = [];
  lines.push(
    "| Modelo | thinking | n | OK válido | p50 OK | p90 OK | p50 (todos) | p90 (todos) | 503 | 429 | timeout | JSON válido sin repair | tokens salida (mediana) | tiendas |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const ranked = [...groups.entries()].map(([k, rs]) => {
    const ok = rs.filter((r) => r.outcome === "ok");
    const okMs = ok.map((r) => r.ms).sort((a, b) => a - b);
    // Anything that did not produce a valid answer counts as "not within the step".
    const allMs = rs.map((r) => (r.outcome === "ok" ? r.ms : Infinity)).sort((a, b) => a - b);
    const answered = rs.filter((r) => ["ok", "invalid"].includes(r.outcome));
    return { k, rs, ok, okMs, allMs, answered, p90all: pct(allMs, 0.9) };
  });
  ranked.sort((a, b) => a.p90all - b.p90all || pct(a.allMs, 0.5) - pct(b.allMs, 0.5));
  for (const g of ranked) {
    const [model, thinking] = g.k.split("|");
    const n = g.rs.length;
    const count = (o: Row["outcome"]) => g.rs.filter((r) => r.outcome === o).length;
    const validRate = g.answered.length ? (g.ok.length / g.answered.length) * 100 : 0;
    const outTok = median(g.ok.map((r) => r.outputTokens ?? 0));
    lines.push(
      `| ${model} | ${thinking} | ${n} | ${g.ok.length}/${n} | ${fmtS(pct(g.okMs, 0.5))} | ${fmtS(pct(g.okMs, 0.9))} | ${fmtS(pct(g.allMs, 0.5))} | ${fmtS(g.p90all)} | ${count("503")} | ${count("429")} | ${count("timeout")} | ${validRate.toFixed(0)}% (${g.ok.length}/${g.answered.length}) | ${Number.isFinite(outTok) ? outTok : "—"} | ${new Set(g.rs.map((r) => r.store)).size} |`,
    );
  }
  return lines.join("\n");
}

if (argv[0] === "--summarize") {
  // Several files may be passed (e.g. two rounds); a BOM from a Windows
  // concatenation must not break the parse.
  const rows = argv
    .slice(1)
    .flatMap((f) => readFileSync(f, "utf8").split("\n"))
    .map((l) => l.replace(/^﻿/, "").trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
  console.log(summarize(rows));
  process.exit(0);
}

// ─── env ────────────────────────────────────────────────────────────────────
const ENV_FILE = process.env.ENV_FILE ?? ".env.local";
for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const k = line.slice(0, line.indexOf("=")).trim();
  let v = line.slice(line.indexOf("=") + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error(`GEMINI_API_KEY missing in ${ENV_FILE}`);

const { GoogleGenAI } = await import("@google/genai");
const { toGeminiSchema, is429, is503, isThinkingConfigError } = await import(
  "../ai/providers/gemini"
);
const { ANALYSIS_TOOL_SCHEMA, AnalysisResultSchema } = await import("../ai/schemas");
const { ANALYZER_SYSTEM, buildAnalyzerUserMessage } = await import("../ai/prompts");
const { classifyPageKind } = await import("../lib/analyzer/page-kind");
const { discoverSite } = await import("../lib/site-discovery");

const BUCKET =
  "https://bniqrniajswqvzkhklad.supabase.co/storage/v1/object/public/screenshots/";

/** Real production captures — two of them refunded on 2026-10-01. */
const STORES = [
  {
    name: "myndr.shop (ligera)",
    file: "d656da20-ec55-4e5c-b6b5-c238917edf76.jpg",
    url: "https://myndr.shop",
  },
  {
    name: "goldx3 PDP (media)",
    file: "97d830c2-e85c-48bf-9b21-38d576a6849e.jpg",
    url: "https://www.goldx3.com/products/earring-diamond-stud-14k-gold",
  },
  {
    name: "artazest PDP (pesada/alta)",
    file: "b8989f67-8bb1-4d2d-ba56-3e46e4e303f5.jpg",
    url: "https://artazest.com/products/color-samples?variant=63376099246429",
  },
];

const MODELS = (
  process.env.BENCH_MODELS ??
  "gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash,gemini-3.1-flash-lite,gemini-3.7-flash,gemini-3.8-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const THINKING = (process.env.BENCH_THINKING ?? "256").split(",").map((s) => Number(s.trim()));
const REPEATS = Number(process.env.BENCH_REPEATS ?? 2);
const GAP_MS = Number(process.env.BENCH_GAP_MS ?? 4000);
const OUT = process.env.BENCH_OUT ?? `benchmark-vision-${Date.now()}.jsonl`;
const SAMPLES_DIR = process.env.BENCH_SAMPLES_DIR;
if (SAMPLES_DIR) mkdirSync(SAMPLES_DIR, { recursive: true });

const ai = new GoogleGenAI({ apiKey: API_KEY });
const schema = toGeminiSchema(ANALYSIS_TOOL_SCHEMA);

// ─── inputs, built once per store ───────────────────────────────────────────
type Prepared = { name: string; base64: string; text: string };
const prepared: Prepared[] = [];
for (const s of STORES) {
  const res = await fetch(BUCKET + s.file);
  if (!res.ok) throw new Error(`screenshot ${s.file}: HTTP ${res.status}`);
  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  let d: Awaited<ReturnType<typeof discoverSite>> | null = null;
  try {
    d = await discoverSite(s.url);
  } catch (err) {
    console.warn(`discovery failed for ${s.url}: ${(err as Error).message}`);
  }
  // Same projection as inngest/functions/analyze-website.ts → runAnalyzerAgent.
  const text = buildAnalyzerUserMessage({
    url: s.url,
    persona: null,
    siteInfo: d
      ? {
          title: d.title,
          description: d.description,
          prices: d.prices,
          platform: d.platform,
          extraPages: d.pageUrls.slice(1, 3),
          headings: d.headings,
          bodyExcerpt: d.bodyExcerpt,
          reviewSnippets: d.reviewSnippets,
          ratingSignal: d.ratingSignal,
          trustSignals: d.trustSignals,
          faqQuestions: d.faqQuestions,
          ctaTexts: d.ctaTexts,
          imageAlts: d.imageAlts,
        }
      : null,
    pageKind: classifyPageKind(s.url),
    extraScreenshotUrls: [],
    groundingBlock: null,
  });
  prepared.push({ name: s.name, base64, text });
  console.log(
    `prepared ${s.name}: image ${(base64.length * 0.75 / 1024).toFixed(0)} KB, prompt ${text.length} chars, discovery ${d ? "ok" : "none"}`,
  );
}

// ─── one attempt ─────────────────────────────────────────────────────────────
async function attempt(model: string, thinking: number, p: Prepared, round: number): Promise<Row> {
  let dropThinking = false;
  const started = Date.now();
  for (;;) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: "image/jpeg", data: p.base64 } }, { text: p.text }],
          },
        ],
        config: {
          systemInstruction: ANALYZER_SYSTEM,
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: schema,
          ...(thinking >= 0 && !dropThinking ? { thinkingConfig: { thinkingBudget: thinking } } : {}),
          abortSignal: AbortSignal.timeout(Math.max(1, STEP_MS - (Date.now() - started))),
        } as never,
      });
      const ms = Date.now() - started;
      const u = resp.usageMetadata as
        | { candidatesTokenCount?: number; thoughtsTokenCount?: number; promptTokenCount?: number }
        | undefined;
      const base = {
        model,
        thinking,
        store: p.name,
        round,
        ms,
        outputTokens: u?.candidatesTokenCount ?? null,
        thoughtTokens: u?.thoughtsTokenCount ?? null,
        promptTokens: u?.promptTokenCount ?? null,
        thinkingDropped: dropThinking || undefined,
      };
      const reason = resp.candidates?.[0]?.finishReason;
      if (reason === "MAX_TOKENS") return { ...base, outcome: "truncated" };
      const text = resp.text ?? "";
      if (!text) return { ...base, outcome: "empty" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ...base, outcome: "invalid", error: "JSON.parse" };
      }
      const v = AnalysisResultSchema.safeParse(parsed);
      if (!v.success) {
        return {
          ...base,
          outcome: "invalid",
          error: v.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        };
      }
      if (SAMPLES_DIR) {
        const safe = `${model}_t${thinking}_${p.name.split(" ")[0]}_r${round}.json`.replace(/[^\w.-]/g, "_");
        writeFileSync(join(SAMPLES_DIR, safe), JSON.stringify(v.data, null, 2));
      }
      return { ...base, outcome: "ok" };
    } catch (err) {
      const raw = (err as Error).message ?? String(err);
      if (!dropThinking && isThinkingConfigError(raw)) {
        dropThinking = true; // same self-heal as production; time keeps running
        continue;
      }
      const ms = Date.now() - started;
      const outcome: Row["outcome"] = is503(raw)
        ? "503"
        : is429(raw)
          ? "429"
          : /abort|timed? ?out/i.test(raw) || ms >= STEP_MS - 50
            ? "timeout"
            : "error";
      return {
        model,
        thinking,
        store: p.name,
        round,
        ms,
        outcome,
        outputTokens: null,
        thoughtTokens: null,
        promptTokens: null,
        thinkingDropped: dropThinking || undefined,
        error: raw.replace(/\s+/g, " ").slice(0, 160),
      };
    }
  }
}

// ─── run, interleaved ────────────────────────────────────────────────────────
// BENCH_ARMS="model:thinking,…" picks exact arms (overrides MODELS × THINKING).
const arms = process.env.BENCH_ARMS
  ? process.env.BENCH_ARMS.split(",").map((s) => {
      const [model, t] = s.trim().split(":");
      return { model, thinking: Number(t ?? 256) };
    })
  : MODELS.flatMap((m) => THINKING.map((t) => ({ model: m, thinking: t })));
const total = arms.length * prepared.length * REPEATS;
console.log(
  `\n${arms.length} arms × ${prepared.length} stores × ${REPEATS} rounds = ${total} calls → ${OUT}\n`,
);
const rows: Row[] = [];
let i = 0;
for (let round = 1; round <= REPEATS; round++) {
  for (const p of prepared) {
    const order = [...arms].sort(() => Math.random() - 0.5);
    for (const arm of order) {
      const row = await attempt(arm.model, arm.thinking, p, round);
      rows.push(row);
      appendFileSync(OUT, JSON.stringify(row) + "\n");
      i++;
      console.log(
        `[${String(i).padStart(3)}/${total}] ${arm.model.padEnd(24)} t=${String(arm.thinking).padEnd(4)} ${p.name.padEnd(28)} ${fmtS(row.ms).padStart(6)} ${row.outcome}${row.outputTokens ? ` out=${row.outputTokens}` : ""}${row.thoughtTokens ? ` think=${row.thoughtTokens}` : ""}${row.error ? ` — ${row.error.slice(0, 90)}` : ""}`,
      );
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
  }
}

console.log("\n" + summarize(rows) + "\n");
