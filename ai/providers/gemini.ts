import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type {
  AIProvider,
  GenerateOptions,
  StructuredCall,
} from "../provider";
import { recordUsage } from "@/lib/usage/meter";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";
const MODEL_FAST = process.env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash";

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

  const callWithKey = (keyIdx: number) =>
    CLIENTS[keyIdx].models.generateContent({
      model: opts.fast ? MODEL_FAST : MODEL,
      contents,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxTokens ?? 8192,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(tool.schema),
        abortSignal: opts.signal,
      } as never,
    });

  // ── Try keys in rotation. On 429 cool down + try next; on 503 retry. ──
  let attemptedKeys = 0;
  let last429: unknown = null;
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

  while (attemptedKeys < KEYS.length) {
    const idx = pickAvailableKey();
    if (idx === null) break; // all keys on cooldown; fall through to the wait path

    attemptedKeys++;

    let local503Attempts = 0;
    let localEmptyAttempts = 0;
    // Inner loop just for 503 / empty-response retries on this same key
    while (true) {
      try {
        const response = await callWithKey(idx);
        const text = extractText(response);
        if (!text) {
          if (localEmptyAttempts < MAX_EMPTY_RETRIES) {
            localEmptyAttempts++;
            console.warn(
              `[gemini] key #${idx + 1} returned empty — retry ${localEmptyAttempts}/${MAX_EMPTY_RETRIES} in ${RETRY_EMPTY_BACKOFF_MS / 1000}s`,
            );
            await new Promise((r) => setTimeout(r, RETRY_EMPTY_BACKOFF_MS));
            continue; // retry same key
          }
          throw new Error("Gemini: empty response");
        }
        reportUsage(response, Boolean(opts.fast));
        return parseJsonText<T>(text);
      } catch (err) {
        const raw = errMsg(err);
        if (is429(raw)) {
          console.warn(
            `[gemini] key #${idx + 1}/${KEYS.length} hit 429 — cooling down ${COOLDOWN_MS / 1000}s, trying next`,
          );
          cooldownUntil.set(idx, Date.now() + COOLDOWN_MS);
          last429 = err;
          break; // exit inner loop, try next key
        }
        if (is503(raw) && local503Attempts < MAX_503_RETRIES) {
          local503Attempts++;
          console.warn(
            `[gemini] key #${idx + 1} got 503 (Google overload) — retry ${local503Attempts}/${MAX_503_RETRIES} in ${RETRY_503_BACKOFF_MS / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, RETRY_503_BACKOFF_MS));
          continue; // retry same key
        }
        // Anything else (bad request, schema mismatch, exhausted 503
        // retries, etc.) — bubble up immediately.
        throw err;
      }
    }
  }

  // ── All keys are on cooldown. Wait for the soonest recovery + 1 retry. ──
  const best = shortestCooldownKey();
  if (best) {
    const sleepMs = Math.min(best.waitMs + 2000, 70_000);
    console.warn(
      `[gemini] all ${KEYS.length} keys on cooldown — waiting ${(sleepMs / 1000).toFixed(1)}s for key #${best.idx + 1} to recover`,
    );
    await new Promise((r) => setTimeout(r, sleepMs));
    try {
      cooldownUntil.delete(best.idx);
      const response = await callWithKey(best.idx);
      const text = extractText(response);
      if (!text) throw new Error("Gemini: empty response after cooldown wait");
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
