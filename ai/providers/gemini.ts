import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type {
  AIProvider,
  GenerateOptions,
  StructuredCall,
} from "../provider";
import { recordUsage } from "@/lib/usage/meter";
import { DeadlineExceededError, deadlineAt } from "@/lib/deadline";

// Defaults target RELIABILITY on Google's free tier, because on Vercel Hobby a
// step has a hard 60s ceiling and an overloaded model can't recover inside it:
//   MODEL      → paid audits. gemini-2.5-flash — a GENERALLY-AVAILABLE,
//                high-capacity backend that rarely 503s. The newer 3.x-family
//                models reason a little better but are capacity-constrained and
//                503 under load; when they do, their retry/back-off ladder eats
//                the whole 60s step and the audit REFUNDS instead of completing
//                (exactly the "took longer to audit / slow AI provider" failure
//                owners saw). A completed audit on a slightly-older flagship
//                beats a refunded one on the newest. Opt back into the cutting-
//                edge model any time with GEMINI_MODEL=gemini-3.5-flash — best
//                once the project has billing enabled (higher capacity, no 503s).
//   MODEL_FAST → free audits + a fallback rung. flash-lite has the highest RPM,
//                so it absorbs bursts.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const MODEL_FAST = process.env.GEMINI_MODEL_FAST ?? "gemini-3.1-flash-lite";
// Stable, generally-available last-resort model. The 3.x models above are
// newer and capacity-constrained (they 503 under load); this GA model is a
// higher-capacity backend that completes the audit when they're all busy.
const MODEL_STABLE = process.env.GEMINI_MODEL_STABLE ?? "gemini-2.5-flash";

/**
 * How many tokens the model may spend THINKING before it starts writing.
 *
 * Measured on production usage_events: `totalTokenCount` consistently exceeded
 * `promptTokenCount + candidatesTokenCount` — by 357, 1158, and 2120 tokens on
 * consecutive audits. That gap is `thoughtsTokenCount`. Nothing here ever set
 * `thinkingConfig`, so the 3.x-family models were thinking as much as they
 * liked, and thinking tokens are generated at output speed: 2000+ of them is
 * tens of seconds spent before the first character of the report exists.
 *
 * Inside a 50s step budget (lib/deadline.ts, sized for Vercel Hobby's 60s
 * ceiling) that is the difference between an audit that finishes and one that
 * refunds — which is what production was doing on real DTC product pages.
 *
 * The default BOUNDS thinking rather than removing it: the audit is a
 * structured extraction against a fixed schema, so a little deliberation helps
 * and an unbounded amount mostly buys latency. Tune without a deploy:
 *   GEMINI_THINKING_BUDGET=0     disable thinking entirely (fastest)
 *   GEMINI_THINKING_BUDGET=-1    model default, i.e. unbounded (pre-fix behaviour)
 *   GEMINI_THINKING_BUDGET=2048  more deliberation, slower
 */
const THINKING_BUDGET = (() => {
  const raw = Number(process.env.GEMINI_THINKING_BUDGET);
  return Number.isFinite(raw) ? Math.round(raw) : 512;
})();

/**
 * Set once if a model rejects `thinkingConfig` (not every model accepts a
 * budget, and some can't disable thinking at all). Same self-healing shape as
 * the ScreenshotOne breaker: we learn it costs one retry, then stop sending it
 * for the life of the lambda rather than failing audits over a tuning knob.
 */
let thinkingConfigRejected = false;

/** True when the error is the model refusing our thinkingConfig, not real work failing. */
export function isThinkingConfigError(raw: string): boolean {
  return (
    /thinking|thought/i.test(raw) &&
    /invalid|unsupported|not supported|unknown|cannot be disabled/i.test(raw)
  );
}

// ─── Multi-key rotation pool ────────────────────────────────────────────────
//
// Why: Gemini's free tier is 15 RPM + 1000 RPD, and the cap is enforced PER
// GOOGLE PROJECT — not per key. With one project any moderately-active testing
// trips it fast, and a rate-limited key waits out a ~65s cooldown that doesn't
// fit Vercel Hobby's 60s step ceiling, so the audit times out and refunds.
//
// ⚠ N keys only give N × the quota when they come from N DIFFERENT projects.
// Generating several keys inside one AI Studio project looks like a bigger pool
// in the env var list and buys you nothing — they all draw on the same 15 RPM.
// One key per Google account is the safest way to be sure.
//
// Setup: in Vercel env vars, set:
//   GEMINI_API_KEY         (primary, required)
//   GEMINI_API_KEY_2       (optional)
//   GEMINI_API_KEY_3       (optional)
//   ... up to GEMINI_API_KEY_10
//
// Behaviour:
//   • Round-robin pick on every call (balances per-minute load)
//   • On 429 from key K, mark K as cooled-down for 65s and immediately
//     try the next available key (no user-visible delay)
//   • If ALL keys are cooled-down simultaneously (e.g. daily quota
//     exhausted across the board), the call surfaces a 429 to Inngest
//     which refunds the credit and shows the user a clean error
//
// Cooldown state is per Vercel Lambda instance — not durable across
// cold starts. That's fine: a cold start probably means the key had
// time to recover anyway, and the worst case is we hit 429 once and
// re-mark the cooldown.

/**
 * Drop repeated key VALUES.
 *
 * The same key pasted into two env slots is pure cost: rotation treats them as
 * two independent chances, so a 429 on one is followed by a guaranteed 429 on
 * the other — a real API round-trip spent proving something already known,
 * inside a step budget the vision call needs.
 *
 * This can only catch LITERAL duplicates. It cannot catch the more common and
 * more expensive mistake: several DIFFERENT keys minted inside the SAME Google
 * project. Those look distinct here but share one 15 RPM bucket, so rotation
 * burns one round-trip per key discovering the same exhausted quota. Nothing in
 * the key string reveals its project, so the guard for that is the warning in
 * the rotation path plus the setup note above: one key per project.
 */
export function dedupeKeys(keys: string[]): string[] {
  return [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
}

function loadKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.GEMINI_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  const unique = dedupeKeys(keys);
  if (unique.length < keys.length) {
    console.warn(
      `[gemini] ${keys.length - unique.length} duplicate API key value(s) ignored — ` +
        `rotation only helps when each key is a DIFFERENT key in a DIFFERENT Google project.`,
    );
  }
  return unique;
}

const KEYS = loadKeys();
const CLIENTS = KEYS.map((apiKey) => new GoogleGenAI({ apiKey }));

// cooldownUntil[i] = timestamp (ms) at which key i becomes usable again.
// Indexed by position in CLIENTS array.
const cooldownUntil: Map<number, number> = new Map();
let rrCursor = 0;

const COOLDOWN_MS = 65_000; // per-minute window + small buffer

/**
 * How long to wait for a call before firing a hedge on a second key.
 *
 * 0 disables hedging entirely, which is the DEFAULT: the projected benefit is
 * large but it is a projection from 15 samples, and it doubles AI calls on the
 * slow tail. See the comment on `callWithKey` for the numbers and the caveat.
 *
 * A sensible first value is 12000. Measured, a third of calls finish under 15s
 * and would pay nothing extra, while the slow tail gets a second independent
 * draw with most of the step budget still in hand.
 */
const HEDGE_AFTER_MS = (() => {
  const raw = Number(process.env.GEMINI_HEDGE_AFTER_MS);
  // Floor of 2s — hedging sooner than that just doubles every call.
  return Number.isFinite(raw) && raw >= 2_000 ? Math.round(raw) : 0;
})();

/**
 * Resolve with the first promise to FULFILL; reject only if both reject.
 *
 * `Promise.race` is the wrong primitive here — it settles on the first
 * REJECTION too, which would let one bad draw decide the run, exactly what
 * hedging exists to prevent. The FIRST error is the one propagated so the
 * caller's retry ladder still sees the error shape it expects (429, 503,
 * empty response…) when neither call worked.
 */
export function firstFulfilled<T>(a: Promise<T>, b: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let rejections = 0;
    let firstError: unknown;
    const onReject = (err: unknown) => {
      if (rejections === 0) firstError = err;
      if (++rejections === 2) reject(firstError);
    };
    a.then(resolve, onReject);
    b.then(resolve, onReject);
  });
}

/**
 * Pick the next non-cooled-down key in round-robin order.
 * Returns the index into CLIENTS, or null if every key is on cooldown.
 */
function pickAvailableKey(): number | null {
  if (CLIENTS.length === 0) return null;
  const now = Date.now();
  for (let i = 0; i < CLIENTS.length; i++) {
    const idx = (rrCursor + i) % CLIENTS.length;
    const cd = cooldownUntil.get(idx) ?? 0;
    if (cd <= now) {
      rrCursor = (idx + 1) % CLIENTS.length;
      return idx;
    }
  }
  return null;
}

/**
 * Find the key whose cooldown ends soonest — used as a last-resort when
 * everyone is rate-limited and we have to wait for at least one to recover.
 */
function shortestCooldownKey(): { idx: number; waitMs: number } | null {
  if (CLIENTS.length === 0) return null;
  let best: { idx: number; waitMs: number } | null = null;
  const now = Date.now();
  for (let i = 0; i < CLIENTS.length; i++) {
    const cd = cooldownUntil.get(i) ?? 0;
    const wait = Math.max(0, cd - now);
    if (best === null || wait < best.waitMs) {
      best = { idx: i, waitMs: wait };
    }
  }
  return best;
}

// ─── Schema conversion ──────────────────────────────────────────────────────

/**
 * Convert our JSON-Schema-ish object to Gemini's `Schema` type.
 *
 * Gemini's schema language is a strict subset of JSON Schema — it accepts
 * `type`, `properties`, `items`, `required`, `enum` and a handful of
 * format hints. We strip unsupported keys (minimum, maximum, maxItems,
 * minItems, etc.) because Gemini rejects them.
 */
function toGeminiSchema(node: unknown): Schema {
  if (!node || typeof node !== "object") {
    return { type: Type.STRING };
  }
  const n = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const t = typeof n.type === "string" ? n.type.toLowerCase() : undefined;
  switch (t) {
    case "object":
      out.type = Type.OBJECT;
      if (n.properties && typeof n.properties === "object") {
        const props: Record<string, Schema> = {};
        for (const [k, v] of Object.entries(
          n.properties as Record<string, unknown>,
        )) {
          props[k] = toGeminiSchema(v);
        }
        out.properties = props;
      }
      if (Array.isArray(n.required)) out.required = n.required;
      break;
    case "array":
      out.type = Type.ARRAY;
      if (n.items) out.items = toGeminiSchema(n.items);
      break;
    case "string":
      out.type = Type.STRING;
      if (Array.isArray(n.enum)) out.enum = n.enum as string[];
      break;
    case "number":
    case "integer":
      out.type = t === "integer" ? Type.INTEGER : Type.NUMBER;
      break;
    case "boolean":
      out.type = Type.BOOLEAN;
      break;
    default:
      out.type = Type.STRING;
  }
  return out as Schema;
}

// ─── Main entry point ───────────────────────────────────────────────────────

async function generateStructured<T>(
  tool: StructuredCall<T>,
  opts: GenerateOptions,
): Promise<T> {
  if (KEYS.length === 0) {
    throw new Error(
      "No Gemini API keys configured. Set GEMINI_API_KEY (and optionally GEMINI_API_KEY_2..10) — get a free key at https://aistudio.google.com/apikey",
    );
  }

  const contents = [
    {
      role: "user",
      parts: opts.parts.map((p) =>
        "text" in p
          ? { text: p.text }
          : {
              inlineData: {
                mimeType: p.mediaType,
                data: p.base64,
              },
            },
      ),
    },
  ];

  // ── Wall-clock budget ────────────────────────────────────────────────────
  //
  // Everything below (key rotation, 503 back-off, empty retries, cooldown
  // wait, model fallback) is bounded by this. Without it the ladders below can
  // sleep well past the 60s Inngest-step ceiling on Vercel, which surfaces as
  // "Your server returned HTTP 504 before the SDK responded" and refunds the
  // audit. With no `deadlineAt` the deadline is effectively infinite, so the
  // behaviour is unchanged for callers that don't opt in.
  const dl = deadlineAt(opts.deadlineAt ?? Number.MAX_SAFE_INTEGER);
  /** Below this there's no point starting another model call. */
  const MIN_CALL_MS = 8_000;

  const baseMaxTokens = opts.maxTokens ?? 8192;

  const callOnce = (
    keyIdx: number,
    model: string,
    maxOutputTokens: number,
    extraSignal?: AbortSignal,
  ) =>
    CLIENTS[keyIdx].models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(tool.schema),
        // Bound the model's thinking time. -1 means "model default", which is
        // what this used to do implicitly and what was blowing the step budget.
        ...(THINKING_BUDGET >= 0 && !thinkingConfigRejected
          ? { thinkingConfig: { thinkingBudget: THINKING_BUDGET } }
          : {}),
        // Abort as soon as the budget is gone (or the caller cancels) so a
        // hanging generation can't run into the platform timeout.
        abortSignal: dl.signal({ parent: extraSignal ?? opts.signal }),
      } as never,
    });

  /**
   * Deferred hedge — the one strategy that attacks the VARIANCE.
   *
   * Measured against a healthy 3-project pool, the same image took 7.4s to past
   * 50s across 15 calls: 33% under 15s, 27% never finishing inside the budget.
   * Nothing we send changes that; the spread is Google-side queueing. So the
   * lever isn't making a call faster, it's not being stuck with one bad draw.
   *
   * After HEDGE_AFTER_MS with no answer, a SECOND call goes out on a DIFFERENT
   * key and whichever answers first wins. Deferred rather than immediate on
   * purpose: the third of calls that are already fast cost nothing extra, so
   * the 2x is paid only on the tail that's actually slow.
   *
   * Projected from those samples (scripts/analyze-vision-latency.mts):
   * completion 73% → 93%, and finishing within 30s 53% → 78%. Those are
   * PROJECTIONS from n=15 assuming the two draws are independent — which is
   * false when Google is globally overloaded, and that run did see a 503. At a
   * correlation of 0.6 the benefit is still 81% / 63%.
   *
   * DEFAULT OFF. It doubles AI calls on the slow tail, and it has not been
   * measured live — only projected. Set GEMINI_HEDGE_AFTER_MS to turn it on.
   */
  const callWithKey = async (
    keyIdx: number,
    model: string,
    maxOutputTokens: number,
  ) => {
    // Not enough keys to hedge onto, feature off, or not enough budget left for
    // the wait plus a second call to be worth starting.
    if (
      HEDGE_AFTER_MS <= 0 ||
      CLIENTS.length < 2 ||
      !dl.has(HEDGE_AFTER_MS + MIN_CALL_MS)
    ) {
      return callOnce(keyIdx, model, maxOutputTokens);
    }

    const primaryCtl = new AbortController();
    const hedgeCtl = new AbortController();
    const primary = callOnce(keyIdx, model, maxOutputTokens, primaryCtl.signal);

    let settled = false;
    const hedge = new Promise<Awaited<ReturnType<typeof callOnce>>>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          if (settled) return;
          const alt = pickAvailableKey();
          // Only hedge onto a DIFFERENT key — a second call on the same one
          // shares its quota and its queue, so it isn't an independent draw.
          if (alt === null || alt === keyIdx) return;
          console.warn(
            `[gemini] ${model} key #${keyIdx + 1} slow past ${HEDGE_AFTER_MS / 1000}s — hedging onto key #${alt + 1}`,
          );
          callOnce(alt, model, maxOutputTokens, hedgeCtl.signal).then(
            resolve,
            reject,
          );
        }, HEDGE_AFTER_MS);
        // Don't hold the event loop open on a hedge that never fires.
        (timer as unknown as { unref?: () => void }).unref?.();
      },
    );

    try {
      // First to SUCCEED wins. A rejection from one side must not cancel the
      // other — the whole point is that one bad draw shouldn't decide the run.
      return await firstFulfilled(primary, hedge);
    } finally {
      settled = true;
      // Stop whichever lost. A generation nobody will read is pure quota.
      primaryCtl.abort();
      hedgeCtl.abort();
    }
  };

  // Google 503 ("model experiencing high demand") is server-side, not
  // key-side — rotating keys won't help because they all hit the same
  // backend. We retry the SAME model once with a short backoff, then let the
  // caller fall back to the DIFFERENT fast model (a separate backend that's
  // rarely overloaded at the same moment). Keeping this short matters: a long
  // same-model backoff just delays the fallback that's more likely to work.
  const MAX_503_RETRIES = 1;
  const RETRY_503_BACKOFF_MS = 4_000;
  // Flash models occasionally return an empty candidate — transient, or a
  // blank/placeholder screenshot that briefly gave the model nothing to read
  // (e.g. a site whose capture was still warming). Retry before failing.
  const MAX_EMPTY_RETRIES = 2;
  const RETRY_EMPTY_BACKOFF_MS = 1_500;
  // A response cut off at the token ceiling is unparseable JSON. Retrying with
  // the SAME ceiling would just truncate again, so we widen it. One retry is
  // enough in practice: the analyzer's report overshoots 8k by a little, not
  // by 2x. Capped so a runaway generation can't eat the whole time budget.
  const MAX_TRUNCATION_RETRIES = 1;
  const TRUNCATION_TOKEN_CAP = 32_768;

  // Run the full key-rotation + retry pipeline against ONE model.
  const runWithModel = async (model: string): Promise<T> => {
    // ── Try keys in rotation. On 429 cool down + try next; on 503 retry. ──
    let attemptedKeys = 0;
    let last429: unknown = null;

    while (attemptedKeys < KEYS.length) {
      // Don't start a call we can't finish — a call cut off by the platform
      // costs the same time and tells us nothing.
      if (!dl.has(MIN_CALL_MS)) {
        throw new DeadlineExceededError(`gemini ${model} (key rotation)`);
      }
      const idx = pickAvailableKey();
      if (idx === null) break; // all keys on cooldown; fall through to wait path

      attemptedKeys++;

      let local503Attempts = 0;
      let localEmptyAttempts = 0;
      let localTruncationAttempts = 0;
      let maxTokensForCall = baseMaxTokens;
      // Inner loop just for 503 / empty-response retries on this same key
      while (true) {
        try {
          const response = await callWithKey(idx, model, maxTokensForCall);
          const text = extractText(response);
          if (!text) {
            // Only retry if the back-off AND another full call still fit in
            // the budget; otherwise fail now with the real reason.
            if (
              localEmptyAttempts < MAX_EMPTY_RETRIES &&
              dl.has(RETRY_EMPTY_BACKOFF_MS + MIN_CALL_MS) &&
              (await dl.sleep(RETRY_EMPTY_BACKOFF_MS))
            ) {
              localEmptyAttempts++;
              console.warn(
                `[gemini] ${model} key #${idx + 1} returned empty — retry ${localEmptyAttempts}/${MAX_EMPTY_RETRIES} after ${RETRY_EMPTY_BACKOFF_MS / 1000}s`,
              );
              continue; // retry same key
            }
            throw new Error("Gemini: empty response");
          }
          // Cut off at the token ceiling → the JSON is half-written. Widen the
          // ceiling and try once more rather than handing JSON.parse a broken
          // object (which surfaced to the user as "response was not valid
          // JSON" and refunded a perfectly good audit).
          if (isTruncated(response)) {
            const wider = Math.min(maxTokensForCall * 2, TRUNCATION_TOKEN_CAP);
            if (
              localTruncationAttempts < MAX_TRUNCATION_RETRIES &&
              wider > maxTokensForCall &&
              dl.has(MIN_CALL_MS)
            ) {
              localTruncationAttempts++;
              console.warn(
                `[gemini] ${model} key #${idx + 1} hit the ${maxTokensForCall}-token ceiling — retrying at ${wider}`,
              );
              maxTokensForCall = wider;
              continue; // retry same key with room to finish
            }
            throw new Error(
              `Gemini: response truncated at the ${maxTokensForCall}-token ceiling`,
            );
          }
          reportUsage(response, Boolean(opts.fast));
          return parseJsonText<T>(text);
        } catch (err) {
          const raw = errMsg(err);
          // The model refused our thinkingConfig (not every model accepts a
          // budget; some can't turn thinking off). Drop it for the rest of this
          // lambda and retry the SAME key immediately — a latency knob must
          // never be the reason a paid audit fails.
          if (!thinkingConfigRejected && isThinkingConfigError(raw)) {
            thinkingConfigRejected = true;
            console.warn(
              `[gemini] ${model} rejected thinkingConfig (${raw.slice(0, 80)}) — retrying without it and not sending it again`,
            );
            continue; // retry same key, now without the config
          }
          if (is429(raw)) {
            console.warn(
              `[gemini] ${model} key #${idx + 1}/${KEYS.length} hit 429 — cooling down ${COOLDOWN_MS / 1000}s, trying next`,
            );
            cooldownUntil.set(idx, Date.now() + COOLDOWN_MS);
            last429 = err;
            break; // exit inner loop, try next key
          }
          if (
            is503(raw) &&
            local503Attempts < MAX_503_RETRIES &&
            dl.has(RETRY_503_BACKOFF_MS + MIN_CALL_MS) &&
            (await dl.sleep(RETRY_503_BACKOFF_MS))
          ) {
            local503Attempts++;
            console.warn(
              `[gemini] ${model} key #${idx + 1} got 503 (Google overload) — retry ${local503Attempts}/${MAX_503_RETRIES} after ${RETRY_503_BACKOFF_MS / 1000}s`,
            );
            continue; // retry same key
          }
          // Anything else (bad request, schema mismatch, exhausted 503
          // retries, etc.) — bubble up immediately.
          throw err;
        }
      }
    }

    // Every key in the pool answered 429 for this model. With keys spread one
    // per Google project that means the account is genuinely saturated — but it
    // is ALSO exactly what a misconfigured pool looks like, because free-tier
    // quota is per PROJECT: several keys minted inside one project share a
    // single 15 RPM bucket, so rotation pays a round-trip per key to rediscover
    // the same exhaustion. That misconfiguration is invisible in the Vercel env
    // list (the names look right) and invisible in the AI Studio key list (the
    // keys are real). This log is the one place it can surface, so say it here
    // rather than leave it to be diagnosed from a latency graph weeks later.
    if (attemptedKeys >= KEYS.length && KEYS.length > 1) {
      console.warn(
        `[gemini] all ${KEYS.length} keys returned 429 for ${model}. If they are not each ` +
          `in a SEPARATE Google project they share one 15 RPM quota, and the pool is ` +
          `spending ${KEYS.length} round-trips to learn that. See ai/providers/gemini.ts setup notes.`,
      );
    }

    // ── All keys are on cooldown. Wait for soonest recovery + 1 retry. ──
    const best = shortestCooldownKey();
    if (best) {
      const sleepMs = Math.min(best.waitMs + 2000, 70_000);
      // This wait alone used to be able to blow the whole step (up to 70s vs a
      // 60s ceiling). If it doesn't fit, surface the 429 immediately: Inngest
      // retries the step with a fresh budget minutes later, which recovers the
      // quota far more reliably than sleeping through the timeout.
      if (!dl.has(sleepMs + MIN_CALL_MS)) {
        console.warn(
          `[gemini] all ${KEYS.length} keys on cooldown and only ${(dl.remaining() / 1000).toFixed(1)}s of budget left — failing fast for a clean retry`,
        );
        throw last429 ?? new DeadlineExceededError(`gemini ${model} (cooldown)`);
      }
      console.warn(
        `[gemini] all ${KEYS.length} keys on cooldown — waiting ${(sleepMs / 1000).toFixed(1)}s for key #${best.idx + 1} to recover`,
      );
      await dl.sleep(sleepMs);
      try {
        cooldownUntil.delete(best.idx);
        // Last-chance call after waiting out a cooldown: go straight to the
        // wider ceiling. There's no budget left for a truncation retry here,
        // and an over-provisioned ceiling costs nothing when unused (output
        // tokens are billed as generated).
        const response = await callWithKey(
          best.idx,
          model,
          Math.min(baseMaxTokens * 2, TRUNCATION_TOKEN_CAP),
        );
        const text = extractText(response);
        if (!text) throw new Error("Gemini: empty response after cooldown wait");
        if (isTruncated(response)) {
          throw new Error(
            "Gemini: response truncated at the token ceiling (after cooldown wait)",
          );
        }
        reportUsage(response, Boolean(opts.fast));
        return parseJsonText<T>(text);
      } catch (err) {
        if (is429(errMsg(err))) {
          cooldownUntil.set(best.idx, Date.now() + COOLDOWN_MS);
        }
        throw err;
      }
    }

    throw last429 ?? new Error("Gemini: all keys exhausted");
  };

  // Model chain: try each in turn, falling back on a recoverable failure
  // (429 quota, 503 overload, …) so the audit still completes.
  //
  // The last rung is a STABLE, generally-available model (gemini-2.5-flash by
  // default). The 3.x-family models this app runs on are newer and
  // capacity-constrained, so both the premium AND fast 3.x models can be
  // overloaded (503) at the same moment — which is exactly what refunded the
  // owner's audits. A GA model is a different, much higher-capacity backend
  // that rarely 503s, so it's the safety net that lets the audit finish when
  // the new models are all busy. Same API key, no extra cost.
  const primaryModel = opts.fast ? MODEL_FAST : MODEL;
  const modelChain = [
    ...new Set(
      (primaryModel === MODEL_FAST
        ? [primaryModel, MODEL_STABLE]
        : [primaryModel, MODEL_FAST, MODEL_STABLE]
      ).filter(Boolean),
    ),
  ];

  let lastErr: unknown = null;
  for (let mi = 0; mi < modelChain.length; mi++) {
    const model = modelChain[mi];
    const isLast = mi === modelChain.length - 1;
    try {
      return await runWithModel(model);
    } catch (err) {
      lastErr = err;
      const raw = errMsg(err);
      // Out of budget → don't start the fallback model. It would be cut off
      // mid-flight, turning a clean retryable failure into a 504.
      if (!dl.has(MIN_CALL_MS)) throw err;
      const recoverable =
        is429(raw) ||
        // 503 "model is overloaded" is the single most common reason a premium
        // audit fails on Google's side. It was NOT in this list, so an
        // overloaded gemini-3.5-flash threw straight to the user instead of
        // falling back to the fast model — which is a DIFFERENT backend and is
        // rarely overloaded at the same moment. This one omission is what
        // surfaced the raw 503 to the owner.
        is503(raw) ||
        /empty response|all keys exhausted|not found|not available|unsupported|billing|permission|INVALID_ARGUMENT|FAILED_PRECONDITION/i.test(
          raw,
        );
      if (!isLast && recoverable) {
        console.warn(
          `[gemini] model "${model}" unavailable (${raw.slice(0, 100)}) — falling back to "${modelChain[mi + 1]}"`,
        );
        // The 429 cooldowns we just set were specific to the premium model's
        // quota; clear them so the fallback model starts with fresh keys.
        cooldownUntil.clear();
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("Gemini: all models exhausted");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error
    ? err.message
    : typeof err === "string"
      ? err
      : JSON.stringify(err);
}

export function is429(raw: string): boolean {
  return /RESOURCE_EXHAUSTED|"code"\s*:\s*429|status.*429|rate.?limit|quota/i.test(
    raw,
  );
}

/**
 * Detect Google's "model overloaded" 503 — temporary, server-side, NOT a
 * key issue. Best handled with a short backoff retry on the same key
 * (rotating keys would just hit the same overloaded backend).
 */
export function is503(raw: string): boolean {
  return /"code"\s*:\s*503|UNAVAILABLE|high demand|model is currently/i.test(raw);
}

/**
 * Best-effort metering: pull token counts off the Gemini response and log a
 * usage_event (attributed to the active AsyncLocalStorage meter context).
 * Never throws — recordUsage is fire-and-forget.
 */
function reportUsage(response: unknown, fast: boolean): void {
  const u = (
    response as {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }
  ).usageMetadata;
  recordUsage({
    provider: "gemini",
    model: fast ? MODEL_FAST : MODEL,
    promptTokens: u?.promptTokenCount ?? 0,
    outputTokens: u?.candidatesTokenCount ?? 0,
    totalTokens: u?.totalTokenCount ?? 0,
  });
}

/**
 * Why the generation stopped. "MAX_TOKENS" means the model was cut off
 * mid-sentence — with responseMimeType json that yields a HALF-WRITTEN object,
 * which JSON.parse rejects with a misleading "Expected ',' or '}'" complaint.
 *
 * Not checking this was silently turning "the report was slightly too long"
 * into a failed, refunded audit.
 */
export function extractFinishReason(response: unknown): string | null {
  // Defensive on purpose: this runs on the audit's critical path, so a null or
  // unexpectedly-shaped response must return "no reason", never throw.
  if (!response || typeof response !== "object") return null;
  const c = (response as { candidates?: Array<{ finishReason?: string }> })
    .candidates?.[0];
  return typeof c?.finishReason === "string" ? c.finishReason : null;
}

/** True when the response was cut off by the output-token ceiling. */
export function isTruncated(response: unknown): boolean {
  const reason = extractFinishReason(response);
  return reason === "MAX_TOKENS" || reason === "LENGTH";
}

function extractText(response: {
  text?: string;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  return (
    response.text ??
    response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ??
    ""
  );
}

function parseJsonText<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(
      `Gemini: response was not valid JSON — ${(e as Error).message}\n--- raw ---\n${text.slice(0, 500)}`,
    );
  }
}

export const geminiProvider: AIProvider = {
  name: "gemini",
  generateStructured,
};
