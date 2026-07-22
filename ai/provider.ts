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
  /**
   * Absolute epoch-ms instant by which this call must be finished.
   *
   * Providers own retry/back-off ladders (429 key rotation, 503 back-off,
   * empty-response retries) that are individually sensible but can add up to
   * far more than the serverless step they run inside — which is how the
   * analyzer ended up being killed mid-step with a 504 instead of failing
   * cleanly. With a deadline the provider skips any wait it can't afford and
   * throws DeadlineExceededError first. See lib/deadline.ts.
   *
   * Omit it and providers behave exactly as before (unbounded).
   */
  deadlineAt?: number;
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

export type ProviderName = "anthropic" | "gemini";

// Cache each concrete provider once so we can hold BOTH at the same time
// (the single `_provider` above only ever holds the globally-configured one).
const _byName: Partial<Record<ProviderName, AIProvider>> = {};

/** Resolve a specific provider by name (lazy-imported + cached). */
export async function getProviderByName(
  name: ProviderName,
): Promise<AIProvider> {
  const cached = _byName[name];
  if (cached) return cached;
  const provider =
    name === "anthropic"
      ? (await import("./providers/anthropic")).anthropicProvider
      : (await import("./providers/gemini")).geminiProvider;
  _byName[name] = provider;
  return provider;
}

/** Whether a given provider has its API key configured. */
function providerConfigured(name: ProviderName): boolean {
  return name === "anthropic"
    ? Boolean(process.env.ANTHROPIC_API_KEY)
    : Boolean(process.env.GEMINI_API_KEY);
}

function normalizeName(value: string | undefined, fallback: ProviderName): ProviderName {
  return (value ?? fallback).toLowerCase() === "anthropic" ? "anthropic" : "gemini";
}

/**
 * Analyzer-specific provider routing. Lets the FREE/fast audit and the PAID
 * audit run on different providers (e.g. Gemini Flash for free to keep the
 * marginal cost in cents, Claude for paid quality), with an optional
 * cross-provider fallback for resilience.
 *
 * Backward-compatible by default: with none of the new env vars set, both
 * tiers resolve to `AI_PROVIDER` and the fallback is off — i.e. identical to
 * the previous single-provider behaviour. Fully reversible via env, no code
 * changes needed to roll back.
 *
 *   ANALYZER_PROVIDER_PAID   provider for paid audits   (default: AI_PROVIDER)
 *   ANALYZER_PROVIDER_FAST   provider for free/fast     (default: AI_PROVIDER)
 *   ANALYZER_CROSS_FALLBACK  "1"/"true" → on a hard failure, retry once on the
 *                            OTHER provider (only if its key is configured).
 *                            Off by default so it never causes surprise spend.
 */
export async function resolveAnalyzerProviders(fast: boolean): Promise<{
  primary: AIProvider;
  fallback: AIProvider | null;
}> {
  const base = normalizeName(process.env.AI_PROVIDER, "gemini");
  const primaryName = fast
    ? normalizeName(process.env.ANALYZER_PROVIDER_FAST, base)
    : normalizeName(process.env.ANALYZER_PROVIDER_PAID, base);

  const otherName: ProviderName =
    primaryName === "anthropic" ? "gemini" : "anthropic";

  const crossOn = /^(1|true|yes|on)$/i.test(
    process.env.ANALYZER_CROSS_FALLBACK ?? "",
  );

  const primary = await getProviderByName(primaryName);
  const fallback =
    crossOn && providerConfigured(otherName)
      ? await getProviderByName(otherName)
      : null;

  return { primary, fallback };
}
