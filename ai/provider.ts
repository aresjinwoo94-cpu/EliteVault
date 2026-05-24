import "server-only";

/**
 * Provider-agnostic interface that all our AI agents use.
 * Currently implemented by:
 *   - ai/providers/anthropic.ts  (Claude)
 *   - ai/providers/gemini.ts     (Google Gemini)
 *
 * Pick the active provider with AI_PROVIDER=gemini|anthropic in .env.local.
 */

export type ImagePart = {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  /** Raw base64, no data: prefix */
  base64: string;
};

export type TextPart = { text: string };

export type ContentPart = ImagePart | TextPart;

/** A "tool" that the model is forced to call exactly once. */
export type StructuredCall<T> = {
  name: string;
  description: string;
  /** JSON-Schema-like shape (subset compatible with both SDKs). */
  schema: Record<string, unknown>;
};

export interface GenerateOptions {
  system: string;
  /** Ordered list of text + image parts in the user message. */
  parts: ContentPart[];
  /** Sampling — same semantics on both providers. */
  temperature?: number;
  maxTokens?: number;
  /** If true, prefers the cheaper/faster model variant. */
  fast?: boolean;
  signal?: AbortSignal;
}

/**
 * Core method: generate a structured JSON object matching `tool.schema`.
 * The provider implementation MUST force the model to emit that schema
 * (Anthropic: tool_choice; Gemini: response_mime_type + responseSchema).
 */
export interface AIProvider {
  name: "anthropic" | "gemini";
  generateStructured<T>(
    tool: StructuredCall<T>,
    opts: GenerateOptions,
  ): Promise<T>;
}

/**
 * Lazy resolver. We don't import the providers at top-level so the unused
 * one doesn't get bundled (and so missing API keys don't crash the boot).
 */
let _provider: AIProvider | null = null;

export async function getProvider(): Promise<AIProvider> {
  if (_provider) return _provider;
  const choice = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (choice === "anthropic") {
    const { anthropicProvider } = await import("./providers/anthropic");
    _provider = anthropicProvider;
  } else {
    const { geminiProvider } = await import("./providers/gemini");
    _provider = geminiProvider;
  }
  return _provider;
}

/** True if either provider has its key set. */
export function isAIConfigured() {
  const choice = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (choice === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  return Boolean(process.env.GEMINI_API_KEY);
}
