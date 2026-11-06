/**
 * Share-card images for pages that declare their own `openGraph` / `twitter`.
 *
 * A page-level `openGraph` object REPLACES the parent's, including the image
 * from the root `app/opengraph-image.tsx` file convention — so without these a
 * page shared on Facebook / LinkedIn / WhatsApp / Slack had no preview image.
 * Both routes are served by app/opengraph-image.tsx and app/twitter-image.tsx
 * (1200×630 PNG). Relative URLs resolve against `metadataBase` in app/layout.tsx.
 */
export const OG_IMAGES = [
  {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    type: "image/png",
    alt: "EliteVault — Copy what actually converts",
  },
];

export const TWITTER_IMAGES = ["/twitter-image"];
