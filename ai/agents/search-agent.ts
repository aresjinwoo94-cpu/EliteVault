import "server-only";
import { getProvider } from "@/ai/provider";
import { SEARCH_SYSTEM } from "@/ai/prompts";
import type { ContentPart } from "@/ai/provider";

interface Candidate {
  id: string;
  title: string;
  niche: string;
  description?: string | null;
  url: string;
}

const RANK_SCHEMA = {
  type: "object",
  properties: {
    ranked: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "reason"],
      },
    },
  },
  required: ["ranked"],
} as const;

/**
 * Re-ranks candidate winning sites against a user's intent (text prompt
 * and/or screenshot of their store). Uses the fast model — this is
 * re-ranking + explanation, not generation.
 */
export async function runSearchAgent(opts: {
  candidates: Candidate[];
  prompt?: string;
  screenshotBase64?: string;
  mediaType?: "image/png" | "image/jpeg" | "image/webp";
}): Promise<{ id: string; reason: string }[]> {
  const provider = await getProvider();

  const candidatesText = opts.candidates
    .map(
      (c) =>
        `- id=${c.id} | ${c.title} (${c.niche}) — ${c.description ?? ""}`,
    )
    .join("\n");

  const parts: ContentPart[] = [];
  if (opts.screenshotBase64 && opts.mediaType) {
    parts.push({ mediaType: opts.mediaType, base64: opts.screenshotBase64 });
  }
  parts.push({
    text: [
      opts.prompt
        ? `User prompt: ${opts.prompt}`
        : "User uploaded their store screenshot — find visually similar winners.",
      "",
      "Candidates:",
      candidatesText,
      "",
      "Re-rank by relevance. Return up to 12 items.",
    ].join("\n"),
  });

  try {
    const raw = await provider.generateStructured<{
      ranked?: { id: string; reason: string }[];
    }>(
      {
        name: "rank_results",
        description: "Ordered ids with one-line reasons.",
        schema: RANK_SCHEMA,
      },
      {
        system: SEARCH_SYSTEM,
        temperature: 0.2,
        maxTokens: 1024,
        fast: true,
        parts,
      },
    );
    return raw.ranked ?? [];
  } catch (err) {
    console.warn("[search agent] failed, falling back:", err);
    return opts.candidates.slice(0, 12).map((c) => ({ id: c.id, reason: "" }));
  }
}
