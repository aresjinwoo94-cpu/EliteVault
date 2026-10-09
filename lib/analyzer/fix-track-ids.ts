/**
 * Fix Track ids — dependency-free so client components can import them without
 * dragging zod / the AI schemas into the browser bundle. The rules live in
 * lib/analyzer/fix-tracks.ts, which re-exports these.
 */
export const TRACKS = ["urgent", "post_purchase", "theme_colors", "competitor"] as const;
export type Track = (typeof TRACKS)[number];
/** The 3 tracks that need a (single, cached) extra AI call. `urgent` never does. */
export const GENERATED_TRACKS = ["post_purchase", "theme_colors", "competitor"] as const;
export type GeneratedTrack = (typeof GENERATED_TRACKS)[number];

export function parseTrack(v: unknown): Track | null {
  return typeof v === "string" && (TRACKS as readonly string[]).includes(v) ? (v as Track) : null;
}
export function isGeneratedTrack(t: Track): t is GeneratedTrack {
  return t !== "urgent";
}
