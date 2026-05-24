import "server-only";
import { z } from "zod";
import { getProvider } from "@/ai/provider";

/**
 * Image Niche Detector — fast first-pass for image search.
 *
 * Given a screenshot of an ecommerce site, returns:
 *   • The most likely niche (matches our `winning_sites.niche` enum)
 *   • A handful of keywords / aesthetic tags useful for SQL pre-filter
 *   • A short style descriptor used by the re-ranker
 *
 * Cheap (~1s on Flash-Lite). Lets us cut a 45-row library down to
 * the 6-10 candidates that actually share the user's niche, BEFORE
 * spending a more expensive re-rank call on them.
 */

const NICHE_ENUM = [
  "skincare", "beauty", "apparel", "fitness", "footwear", "eyewear",
  "accessories", "home", "wellness", "grooming", "pet", "beverage", "baby",
] as const;

const DetectionSchema = z.object({
  niche: z.enum(NICHE_ENUM),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string().max(40)).min(1).max(8),
  style: z.string().min(3).max(220),
});
export type NicheDetection = z.infer<typeof DetectionSchema>;

const SCHEMA = {
  type: "object",
  properties: {
    niche: { type: "string", enum: [...NICHE_ENUM] },
    confidence: { type: "number" },
    keywords: { type: "array", items: { type: "string" } },
    style: { type: "string" },
  },
  required: ["niche", "confidence", "keywords", "style"],
} as const;

const SYSTEM = `You are a senior visual merchandiser + brand strategist who
classifies ecommerce stores at a glance. Given a screenshot, identify the
single most likely product niche from this list:

  skincare, beauty, apparel, fitness, footwear, eyewear, accessories,
  home, wellness, grooming, pet, beverage, baby

Return that niche, a confidence (0..1), 3-6 keywords describing the visual
aesthetic (e.g. "minimal", "editorial", "millennial-pink"), and a 1-2 sentence
style descriptor. NEVER invent a niche outside the list.

Call \`detect_niche\` exactly once.`;

export async function detectImageNiche(opts: {
  screenshotBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  signal?: AbortSignal;
}): Promise<NicheDetection> {
  const provider = await getProvider();
  const raw = await provider.generateStructured<unknown>(
    {
      name: "detect_niche",
      description: "Classify the niche + aesthetic of this ecommerce screenshot.",
      schema: SCHEMA,
    },
    {
      system: SYSTEM,
      temperature: 0.2,
      maxTokens: 512,
      fast: true,
      signal: opts.signal,
      parts: [
        { mediaType: opts.mediaType, base64: opts.screenshotBase64 },
        { text: "Classify this store." },
      ],
    },
  );
  const parsed = DetectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Niche detection: schema mismatch");
  }
  return parsed.data;
}
