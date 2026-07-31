import { NICHE_LABELS } from "@/lib/library/niches";

/**
 * Client-safe niche resolver for the Growth Map.
 *
 * The canonical resolver (lib/library/niche-winners.ts) is `server-only`, so it
 * can't be imported into the client seed render. This is a lightweight mirror of
 * the SAME taxonomy (keyword scan over domain + summary) that runs safely on
 * both client and server, keeping the seed label and the server-built label
 * consistent. `niches.ts` carries no `server-only`, so NICHE_LABELS is safe here.
 */

const NICHE_KEYWORDS: { slug: string; keywords: string[] }[] = [
  { slug: "skincare", keywords: ["skincare", "skin care", "serum", "moisturiz", "cleanser", "spf", "dermatolog"] },
  { slug: "grooming", keywords: ["grooming", "razor", "shave", "beard", "trimmer", "manscap"] },
  { slug: "beauty", keywords: ["beauty", "makeup", "cosmetic", "lipstick", "fragrance", "mascara", "foundation"] },
  { slug: "footwear", keywords: ["footwear", "shoe", "sneaker", "boot", "sandal", "slipper", "loafer"] },
  { slug: "eyewear", keywords: ["eyewear", "glasses", "sunglasses", "optical", "blue-light", "frames"] },
  { slug: "fitness", keywords: ["fitness", "gym", "athletic", "athleisure", "workout", "yoga", "activewear", "training", "sport"] },
  { slug: "wellness", keywords: ["wellness", "supplement", "vitamin", "nutrition", "telehealth", "hydration", "greens", "health"] },
  { slug: "pet", keywords: ["pet", "dog", "cat", "puppy", "kitten"] },
  { slug: "baby", keywords: ["baby", "infant", "toddler", "parenting", "nursery", "stroller"] },
  { slug: "accessories", keywords: ["accessor", "wallet", "backpack", "watch", "jewel", "jewellery", "edc", "handbag"] },
  { slug: "home", keywords: ["home", "decor", "furniture", "kitchen", "bedding", "mattress", "sleep", "blanket", "linen", "pillow"] },
  { slug: "beverage", keywords: ["beverage", "soda", "coffee", "tea", "cereal", "snack", "drink", "juice", "food"] },
  { slug: "apparel", keywords: ["apparel", "clothing", "fashion", "dress", "denim", "hoodie", "t-shirt", "tee", "womenswear", "menswear", "outfit", "knitwear"] },
];

/** Resolve a store to a display niche label, or "ecommerce" when unknown. */
export function resolveNicheLabel(input: {
  url: string | null;
  summary?: string | null;
}): string {
  let host = "";
  try {
    if (input.url) host = new URL(input.url).hostname.replace(/^www\./, "");
  } catch {
    /* uploaded screenshot / malformed URL — summary only */
  }
  const haystack = `${host} ${input.summary ?? ""}`.toLowerCase();
  if (haystack.trim()) {
    for (const { slug, keywords } of NICHE_KEYWORDS) {
      if (keywords.some((k) => haystack.includes(k))) {
        return NICHE_LABELS[slug]?.label ?? "ecommerce";
      }
    }
  }
  return "ecommerce";
}
