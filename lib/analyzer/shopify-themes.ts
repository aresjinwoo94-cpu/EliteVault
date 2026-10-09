/**
 * Closed list of official Shopify themes the `theme_colors` Fix Track may
 * recommend (docs/store-audit-fix-tracks-premium.md §3.3).
 *
 * The model can only pick a `slug` from this list; anything else is dropped in
 * code (sanitizeFixes). Names, price and URLs were verified one by one against
 * themes.shopify.com on 2026-10-08 — do NOT add an entry from memory, open its
 * theme-store page first. "Crave" was left out because its page redirected to a
 * login wall and couldn't be verified.
 *
 * `fits` is a short style/industry hint taken from each theme's own store
 * description; it steers the model, it is not a ranking.
 */
export interface ShopifyTheme {
  slug: string;
  name: string;
  /** All entries are free, official (Shopify-built) themes. */
  price: "free";
  fits: string;
  url: string;
}

const t = (slug: string, name: string, fits: string): ShopifyTheme => ({
  slug,
  name,
  price: "free",
  fits,
  url: `https://themes.shopify.com/themes/${slug}`,
});

export const SHOPIFY_THEMES: readonly ShopifyTheme[] = [
  t("dawn", "Dawn", "fast, neutral, general-purpose default"),
  t("refresh", "Refresh", "bold, minimalist; jewelry, accessories, food & drink"),
  t("craft", "Craft", "refined, elegant, generous spacing; jewelry, accessories, food & drink"),
  t("sense", "Sense", "fresh, bright, soft gradients and curved elements; jewelry, accessories, food & drink"),
  t("taste", "Taste", "bold branding, industrial fonts, high contrast; food & drink, jewelry, accessories"),
  t("studio", "Studio", "art and collections; few, visually rich products"),
  t("ride", "Ride", "sleek, dark, bold typography; sports"),
  t("origin", "Origin", "makers selling unique pieces; neutral palette, quirky type"),
  t("colorblock", "Colorblock", "colourful, bold; high-end fashion and clothing"),
  t("publisher", "Publisher", "avant-garde, moody; jewelry, accessories, food & drink"),
  t("spotlight", "Spotlight", "clean and efficient"),
  t("trade", "Trade", "professional, timeless; wholesale"),
  t("horizon", "Horizon", "launch-ready minimalism; clean, modern"),
];

const BY_SLUG = new Map(SHOPIFY_THEMES.map((th) => [th.slug, th]));

export function themeBySlug(slug: unknown): ShopifyTheme | null {
  return typeof slug === "string" ? (BY_SLUG.get(slug.trim().toLowerCase()) ?? null) : null;
}
