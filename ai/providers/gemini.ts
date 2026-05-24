import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type {
  AIProvider,
  GenerateOptions,
  StructuredCall,
} from "../provider";

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY ?? "noop",
});

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";
const MODEL_FAST = process.env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash";

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

async function generateStructured<T>(
  tool: StructuredCall<T>,
  opts: GenerateOptions,
): Promise<T> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY not set — get a free key at https://aistudio.google.com/apikey",
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

  // The full analyzer JSON (8 annotations + persona + scenarios + top fixes)
  // routinely hits 5-7k characters. Defaulting to 4k tokens truncates it.
  // Flash supports 8k output for free tier so we lean on the high end.
  //
  // Free-tier Gemini has tight per-minute rate limits. We auto-retry on 429
  // using the retry_delay the API tells us — up to 3 attempts. Anything else
  // bubbles up to Inngest's own retry/onFailure path.
  const callOnce = () =>
    client.models.generateContent({
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

  const response = await withQuotaRetry(callOnce, 3);

  const text =
    response.text ??
    response.candidates?.[0]?.content?.parts
      ?.map((p) => ("text" in p ? p.text : ""))
      .join("") ??
    "";

  if (!text) {
    throw new Error("Gemini: empty response");
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(
      `Gemini: response was not valid JSON — ${(e as Error).message}\n--- raw ---\n${text.slice(0, 500)}`,
    );
  }
}

/**
 * Retries a Gemini call on 429 (RESOURCE_EXHAUSTED), respecting the
 * server-suggested retry_delay. Caps wait at 30s per retry, total 3 tries.
 *
 * On Gemini free tier, per-minute rate limits trigger a 429 with a
 * retry_delay header — usually 10-50s. Sleeping that long inside an
 * Inngest step is fine: Inngest's overall step timeout is 5 min.
 */
async function withQuotaRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const raw =
        err instanceof Error ? err.message : typeof err === "string" ? err : "";
      const is429 = /RESOURCE_EXHAUSTED|"code"\s*:\s*429|status.*429/i.test(raw);
      if (!is429 || attempt === maxAttempts) throw err;

      // Try to honor retry_delay from the API; fall back to exponential.
      const m = raw.match(/Please retry in ([\d.]+)s/);
      const apiDelay = m ? Math.min(parseFloat(m[1]), 30) : null;
      const backoff = apiDelay ?? Math.min(2 ** attempt * 4, 30);
      console.warn(
        `[gemini] 429 on attempt ${attempt}/${maxAttempts}, waiting ${backoff}s…`,
      );
      await new Promise((r) => setTimeout(r, backoff * 1000));
    }
  }
  throw lastErr;
}

export const geminiProvider: AIProvider = {
  name: "gemini",
  generateStructured,
};
