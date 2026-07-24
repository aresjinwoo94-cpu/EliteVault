import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type {
  AIProvider,
  GenerateOptions,
  StructuredCall,
} from "../provider";
import { recordUsage } from "@/lib/usage/meter";
import { DeadlineExceededError, deadlineAt } from "@/lib/deadline";

// Defaults target the BEST models still covered by Google's free tier:
//   MODEL      → paid audits. gemini-3.5-flash is the strongest free-tier
//                vision model; far better reasoning than any *-flash-lite.
//   MODEL_FAST → free audits + the fallback rung of the model chain below.
//                flash-lite has the highest RPM, so it absorbs bursts.
// If MODEL hits its (lower) free-tier RPM, the chain degrades to MODEL_FAST
// instead of failing the audit. Switch to gemini-2.5-pro / gemini-3.1-pro
// once the project has billing enabled.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const MODEL_FAST = process.env.GEMINI_MODEL_FAST ?? "gemini-3.1-flash-lite";

// ─── Multi-key rotation pool ────────────────────────────────────────────────
//
// Why: Gemini's free tier is 15 RPM + 1000 RPD PER API KEY. With one key
// any moderately-active testing trips the cap fast. With N keys we get
// effectively N × the quota at zero cost — keys are free to generate
// in AI Studio (one per Google account, or per project).
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

function loadKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.GEMINI_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return keys;
}

const KEYS = loadKeys();
const CLIENTS = KEYS.map((apiKey) => new GoogleGenAI({ apiKey }));

// cooldownUntil[i] = timestamp (ms) at which key i becomes usable again.
// Indexed by position in CLIENTS array.
const cooldownUntil: Map<number, number> = new Map();
let rrCursor = 0;

const COOLDOWN_MS = 65_000; // per-minute window + small buffer

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

  const callWithKey = (keyIdx: number, model: string, maxOutputTokens: number) =>
    CLIENTS[keyIdx].models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(tool.schema),
        // Abort as soon as the budget is gone (or the caller cancels) so a
        // hanging generation can't run into the platform timeout.
        abortSignal: dl.signal({ parent: opts.signal }),
      } as never,
    });

  // Google 503 ("model experiencing high demand") is server-side, not
  // key-side — rotating keys won't help because they all hit the same
  // backend. We retry the SAME key with a short backoff before giving up.
  const MAX_503_RETRIES = 2;
  const RETRY_503_BACKOFF_MS = 8_000;
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

  // The premium model (e.g. gemini-2.5-pro) often isn't usable on the
  // free-tier keys this app runs on — it 429s on quota or needs billing,
  // which surfaced as "empty response" / refunded audits for PAID users.
  // Try the configured model, then fall back to the fast model so the audit
  // still completes. Free audits already run on MODEL_FAST (nothing to add).
  const primaryModel = opts.fast ? MODEL_FAST : MODEL;
  const modelChain =
    primaryModel === MODEL_FAST ? [primaryModel] : [primaryModel, MODEL_FAST];

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

function is429(raw: string): boolean {
  return /RESOURCE_EXHAUSTED|"code"\s*:\s*429|status.*429|rate.?limit|quota/i.test(
    raw,
  );
}

/**
 * Detect Google's "model overloaded" 503 — temporary, server-side, NOT a
 * key issue. Best handled with a short backoff retry on the same key
 * (rotating keys would just hit the same overloaded backend).
 */
function is503(raw: string): boolean {
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
