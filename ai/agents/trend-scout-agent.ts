import "server-only";
import { getProvider } from "@/ai/provider";

/**
 * Trend Scout (Phase 2) — runs INSIDE the weekly cron job, never per user.
 *
 * Given an ecommerce niche, returns the sub-niches/themes and specific
 * products that are rising or falling right now, each with a momentum score
 * and a one-line rationale. Uses the cheap FAST model (Gemini Flash) because
 * it runs ~14× per week (once per niche) and the output is cached for every
 * user to read.
 *
 * HONESTY: this is the model's best ESTIMATE from its training + general
 * market knowledge, NOT live scraped data. The caller stamps every row with
 * provenance='estimated' and the week, and the UI says so plainly.
 */

const TREND_SCOUT_SCHEMA = {
  type: "object",
  properties: {
    subniches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          direction: { type: "string", enum: ["up", "down"] },
          score: { type: "integer" },
          rationale: { type: "string" },
        },
        required: ["item", "direction", "score", "rationale"],
      },
    },
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product: { type: "string" },
          direction: { type: "string", enum: ["up", "down"] },
          score: { type: "integer" },
          rationale: { type: "string" },
        },
        required: ["product", "direction", "score", "rationale"],
      },
    },
  },
  required: ["subniches", "products"],
} as const;

const SYSTEM =
  "You are a senior ecommerce/DTC trend analyst. For the given niche, name " +
  "the sub-niches/themes and the specific products that are clearly RISING or " +
  "FALLING in consumer demand right now. Be concrete and current — real " +
  "product types buyers are searching for, not generic categories. For each, " +
  "give: direction (up|down), a momentum score 0-100 (how strong the move is), " +
  "and ONE short rationale sentence. Return 6-8 sub-niches and 6-8 products. " +
  "These are informed ESTIMATES from your market knowledge, not live data — " +
  "do not fabricate precise statistics or cite fake sources.";

export type TrendScoutItem = {
  item: string;
  direction: "up" | "down";
  score: number;
  rationale: string;
};
export type TrendScoutProduct = {
  product: string;
  direction: "up" | "down";
  score: number;
  rationale: string;
};
export type TrendScoutResult = {
  subniches: TrendScoutItem[];
  products: TrendScoutProduct[];
};

const clampScore = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
};
const dir = (d: unknown): "up" | "down" => (d === "down" ? "down" : "up");

export async function runTrendScout(opts: {
  niche: string;
  signal?: AbortSignal;
}): Promise<TrendScoutResult> {
  const provider = await getProvider();
  const raw = await provider.generateStructured<{
    subniches?: Array<Record<string, unknown>>;
    products?: Array<Record<string, unknown>>;
  }>(
    {
      name: "submit_trends",
      description: "Submit rising/falling sub-niches and products for a niche.",
      schema: TREND_SCOUT_SCHEMA as unknown as Record<string, unknown>,
    },
    {
      system: SYSTEM,
      temperature: 0.5,
      maxTokens: 2048,
      fast: true,
      signal: opts.signal,
      parts: [
        {
          text: `Niche: "${opts.niche}". List the rising and falling sub-niches and products for the current week.`,
        },
      ],
    },
  );

  const subniches: TrendScoutItem[] = (raw?.subniches ?? [])
    .map((s) => ({
      item: String(s.item ?? "").slice(0, 120).trim(),
      direction: dir(s.direction),
      score: clampScore(s.score),
      rationale: String(s.rationale ?? "").slice(0, 280).trim(),
    }))
    .filter((s) => s.item.length > 0)
    .slice(0, 10);

  const products: TrendScoutProduct[] = (raw?.products ?? [])
    .map((p) => ({
      product: String(p.product ?? "").slice(0, 120).trim(),
      direction: dir(p.direction),
      score: clampScore(p.score),
      rationale: String(p.rationale ?? "").slice(0, 280).trim(),
    }))
    .filter((p) => p.product.length > 0)
    .slice(0, 10);

  return { subniches, products };
}
