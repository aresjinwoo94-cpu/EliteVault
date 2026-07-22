import "server-only";
import { getProvider } from "@/ai/provider";

/**
 * P1.2 — instant teaser score.
 *
 * A deliberately tiny, FAST call (Flash-Lite tier) that returns just a
 * first-impression score + one-line headline from the homepage screenshot.
 * It runs early in the pipeline so the analyzing screen can show a real
 * number within a few seconds, instead of a mute spinner for the full
 * 20-60s audit. It is best-effort: any failure returns null and the full
 * audit proceeds unaffected.
 */

const QUICK_SCORE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer" },
    headline: { type: "string" },
  },
  required: ["score", "headline"],
} as const;

const QUICK_SCORE_SYSTEM =
  "You are a senior conversion-rate (CRO) expert. From this ecommerce " +
  "store's above-the-fold screenshot, give a FAST first-impression " +
  "conversion score from 0 to 100 and ONE punchy sentence naming the single " +
  "biggest lever. This is a teaser shown while the full audit runs — be " +
  "decisive, not exhaustive. It's an estimate, not a prediction.";

export async function runQuickScore(opts: {
  screenshotBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  url?: string;
  signal?: AbortSignal;
  /** Epoch-ms budget ceiling — see lib/deadline.ts. */
  deadlineAt?: number;
}): Promise<{ score: number; headline: string } | null> {
  try {
    const provider = await getProvider();
    const raw = await provider.generateStructured<{
      score: number;
      headline: string;
    }>(
      {
        name: "submit_quick_score",
        description: "Submit a fast first-impression CRO score.",
        schema: QUICK_SCORE_SCHEMA as unknown as Record<string, unknown>,
      },
      {
        system: QUICK_SCORE_SYSTEM,
        temperature: 0.3,
        maxTokens: 256,
        fast: true,
        signal: opts.signal,
        // The teaser must never be the reason a step runs long: it's a nice-to
        // -have that renders while the real audit works.
        deadlineAt: opts.deadlineAt,
        parts: [
          { mediaType: opts.mediaType, base64: opts.screenshotBase64 },
          {
            text: `Store URL: ${
              opts.url ?? "(uploaded screenshot)"
            }. Return a score (0-100) and a one-line headline.`,
          },
        ],
      },
    );

    const rawScore = Number(raw?.score);
    if (!Number.isFinite(rawScore)) return null;
    const score = Math.round(rawScore > 1 ? rawScore : rawScore * 100);
    return {
      score: Math.max(0, Math.min(100, score)),
      headline: String(raw?.headline ?? "").slice(0, 200),
    };
  } catch (err) {
    console.warn("[quick-score] skipped:", (err as Error).message);
    return null;
  }
}
