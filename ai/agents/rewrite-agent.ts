import "server-only";
import { getProvider } from "@/ai/provider";
import {
  REWRITE_TOOL_SCHEMA,
  RewriteResultSchema,
  type RewriteResult,
} from "@/ai/schemas";
import { REWRITE_SYSTEM, buildRewriteUserMessage } from "@/ai/prompts";

/**
 * Auto-Rewrite agent. Takes the user's screenshot + audit summary and
 * produces a self-contained HTML+CSS replacement for the targeted section.
 * Output is sandboxed at render-time in <iframe srcDoc>.
 */
export async function runRewriteAgent(opts: {
  screenshotBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  section: "hero" | "product" | "pricing" | string;
  niche?: string;
  rationale?: string;
  signal?: AbortSignal;
}): Promise<RewriteResult> {
  const provider = await getProvider();

  const raw = await provider.generateStructured<unknown>(
    {
      name: "submit_rewrite",
      description: "Submit the rewritten section as self-contained HTML + CSS.",
      schema: REWRITE_TOOL_SCHEMA,
    },
    {
      system: REWRITE_SYSTEM,
      temperature: 0.7,
      maxTokens: 4096,
      signal: opts.signal,
      parts: [
        { mediaType: opts.mediaType, base64: opts.screenshotBase64 },
        { text: buildRewriteUserMessage(opts) },
      ],
    },
  );

  const parsed = RewriteResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      "Rewrite: schema mismatch — " +
        parsed.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  }
  return parsed.data;
}
