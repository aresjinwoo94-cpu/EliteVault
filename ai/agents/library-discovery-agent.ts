import "server-only";
import { z } from "zod";
import { getProvider } from "@/ai/provider";

/**
 * Library Discovery Agent.
 *
 * Given a niche, the agent returns candidate ecommerce stores that are
 * likely currently advertising. Each candidate comes with an **estimated**
 * Ad Activity proxy + metrics. We mark these honestly with `estimated: true`
 * so the UI can show an "Estimated" badge.
 *
 * IMPORTANT: this is the bootstrap path. Once you have a Meta Ad Library
 * developer token, swap this for a real-data fetcher and keep the same
 * output schema — the UI doesn't care about the source.
 */

const CandidateSchema = z.object({
  url: z.string(),
  domain: z.string(),
  title: z.string().min(2).max(80),
  description: z.string().max(280),
  niche: z.string(),
  tags: z.array(z.string()).max(8),
  metrics: z.object({
    ctr: z.number().min(0).max(20),
    roi: z.number().min(0).max(20),
    conv_rate: z.number().min(0).max(20),
    traffic_est: z.number().min(0).max(100_000_000),
  }),
  ad_signals: z.object({
    active_ads: z.number().min(0).max(5000),
    days_running_max: z.number().min(0).max(2000),
    region_count: z.number().min(0).max(60),
    last_seen: z.string(),       // ISO date
    activity_score: z.number().min(0).max(100),
    estimated: z.boolean(),
  }),
});

const ResultSchema = z.object({
  candidates: z.array(CandidateSchema).min(1).max(20),
  caveats: z.array(z.string()).max(5),
});
export type LibraryDiscoveryResult = z.infer<typeof ResultSchema>;

const SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          domain: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          niche: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          metrics: {
            type: "object",
            properties: {
              ctr: { type: "number" },
              roi: { type: "number" },
              conv_rate: { type: "number" },
              traffic_est: { type: "number" },
            },
            required: ["ctr", "roi", "conv_rate", "traffic_est"],
          },
          ad_signals: {
            type: "object",
            properties: {
              active_ads: { type: "number" },
              days_running_max: { type: "number" },
              region_count: { type: "number" },
              last_seen: { type: "string" },
              activity_score: { type: "number" },
              estimated: { type: "boolean" },
            },
            required: [
              "active_ads",
              "days_running_max",
              "region_count",
              "last_seen",
              "activity_score",
              "estimated",
            ],
          },
        },
        required: [
          "url",
          "domain",
          "title",
          "description",
          "niche",
          "tags",
          "metrics",
          "ad_signals",
        ],
      },
    },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: ["candidates", "caveats"],
} as const;

const SYSTEM = `You are EliteVault's Library Discovery agent.

Given a niche, return REAL ecommerce stores you know to currently advertise
on Meta. Stick to brands a media buyer in 2024-2026 would actually cite.

For each candidate, estimate:
- metrics (CTR, ROI, conv_rate, traffic_est) using public benchmarks for
  the brand's tier (DTC mid-market vs scale enterprise)
- ad_signals: a proxy for "are they spending hard?" — set estimated=true
  ALWAYS (we don't have direct Meta Ad Library data)
- activity_score 0..100 (higher = more aggressive paid social)

NEVER invent brands that don't exist. If you can't think of 8+, return what
you know and add a caveat. Prefer brands with public landing pages that
load on mobile and accept US/EU credit cards.

Output JSON via the schema. No prose.`;

export async function runLibraryDiscoveryAgent(opts: {
  niche: string;
  exclude?: string[];          // domains already in DB
  desiredCount?: number;       // 8-12
}): Promise<LibraryDiscoveryResult> {
  const provider = await getProvider();
  const text = [
    `Niche: ${opts.niche}`,
    `Desired candidates: ${opts.desiredCount ?? 10}`,
    opts.exclude?.length
      ? `Skip these domains (already in our Library):\n${opts.exclude.slice(0, 40).join(", ")}`
      : "",
    "",
    "Return diverse picks — different price tiers, ages, brand voices.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await provider.generateStructured<unknown>(
    {
      name: "submit_discovery",
      description: "Submit candidate stores for the Library.",
      schema: SCHEMA,
    },
    {
      system: SYSTEM,
      temperature: 0.6,
      maxTokens: 4096,
      parts: [{ text }],
    },
  );

  const parsed = ResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      "Library discovery: schema mismatch — " +
        parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")).join(", "),
    );
  }
  return parsed.data;
}
