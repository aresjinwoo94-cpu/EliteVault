import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  GenerateOptions,
  StructuredCall,
} from "../provider";
import { recordUsage } from "@/lib/usage/meter";

// maxRetries: the SDK retries transient failures (429 rate-limit, 529
// overloaded, 500/503, connection/timeouts) with exponential backoff and
// honours any Retry-After header — exactly the resilience the analyzer needs
// under load. Default 2; we bump it so a brief Anthropic hiccup doesn't fail
// (and refund) a paid audit. Override with ANTHROPIC_MAX_RETRIES.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "noop",
  maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES ?? 4),
});

// Default workhorse = Sonnet 5 (top-tier visual reasoning at ~$3/$15 per 1M).
// Bump to claude-opus-4-8 via env for maximum quality on the Scale tier.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MODEL_FAST =
  process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001";

async function generateStructured<T>(
  tool: StructuredCall<T>,
  opts: GenerateOptions,
): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — configure it or switch AI_PROVIDER",
    );
  }

  const content: Anthropic.MessageParam["content"] = opts.parts.map((p) =>
    "text" in p
      ? { type: "text" as const, text: p.text }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: p.mediaType,
            data: p.base64,
          },
        },
  );

  const response = await client.messages.create(
    {
      model: opts.fast ? MODEL_FAST : MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.4,
      system: opts.system,
      tools: [
        {
          name: tool.name,
          description: tool.description,
          input_schema: tool.schema as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content }],
    },
    opts.signal ? { signal: opts.signal } : undefined,
  );

  const toolUse = response.content.find(
    (c): c is Extract<typeof c, { type: "tool_use" }> =>
      c.type === "tool_use" && c.name === tool.name,
  );
  if (!toolUse) {
    throw new Error(`Anthropic: model did not call ${tool.name}`);
  }
  // Best-effort metering (fire-and-forget).
  recordUsage({
    provider: "anthropic",
    model: opts.fast ? MODEL_FAST : MODEL,
    promptTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  });
  return toolUse.input as T;
}

export const anthropicProvider: AIProvider = {
  name: "anthropic",
  generateStructured,
};
