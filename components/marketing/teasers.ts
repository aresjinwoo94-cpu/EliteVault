/**
 * Landing teasers: 1 main (hero player) + 2 secondary ("More demos" row).
 *
 * Entries with `ready: false` are NOT rendered at all (no card, no gap, no
 * "coming soon"). While both secondaries are false the hero is identical to
 * the single-teaser layout.
 *
 * TO ACTIVATE A SECONDARY TEASER (Ariel):
 *   1. Drop the three files into `public/videos/` with EXACTLY these names:
 *        analyzer-pro-teaser.webm / .mp4 / -poster.jpg
 *        simulator-teaser.webm   / .mp4 / -poster.jpg
 *   2. Flip that entry's `ready` to `true` below.
 *   3. Optionally adjust `durationLabel` in lib/i18n/messages.ts
 *      (teasers.proDuration / teasers.simulatorDuration, EN + ES).
 *
 * VIDEO SPEC (same as the main teaser):
 *   • Aspect 1080×512.
 *   • Crop out the browser URL bar — the player draws its own chrome.
 *   • ≤ 60 s, deliver BOTH webm and mp4.
 *   • Poster = one real frame of the recording (jpg).
 */

export type TeaserId = "main" | "pro" | "simulator";

export type TeaserBadge = "pro" | "diamond" | null;

export interface Teaser {
  id: TeaserId;
  webm: string;
  mp4: string;
  poster: string;
  /** Small (240px) thumbnail for the "More demos" card; the full poster is for the modal player. */
  thumb?: string;
  /** i18n key (CORE namespace `teasers`) for the card title. */
  titleKey: string;
  /** i18n key for the one-line sub shown in the modal. */
  subKey: string;
  /** i18n key for the duration chip, e.g. "~1 min · sound on". */
  durationLabelKey: string;
  badge: TeaserBadge;
  /** false ⇒ not rendered anywhere (no tile, no placeholder). */
  ready: boolean;
}

export const MAIN_TEASER: Teaser = {
  id: "main",
  webm: "/videos/analyzer-teaser.webm",
  mp4: "/videos/analyzer-teaser.mp4",
  poster: "/videos/analyzer-teaser-poster.jpg",
  titleKey: "hero.teaserTitle",
  subKey: "hero.teaserTitle",
  durationLabelKey: "hero.teaserDuration",
  badge: null,
  ready: true,
};

export const SECONDARY_TEASERS: Teaser[] = [
  {
    id: "pro",
    webm: "/videos/analyzer-pro-teaser.webm",
    mp4: "/videos/analyzer-pro-teaser.mp4",
    poster: "/videos/analyzer-pro-teaser-poster.jpg",
    thumb: "/videos/analyzer-pro-teaser-thumb.jpg",
    titleKey: "teasers.proTitle",
    subKey: "teasers.proSub",
    durationLabelKey: "teasers.proDuration",
    badge: "pro",
    ready: true,
  },
  {
    id: "simulator",
    webm: "/videos/simulator-teaser.webm",
    mp4: "/videos/simulator-teaser.mp4",
    poster: "/videos/simulator-teaser-poster.jpg",
    thumb: "/videos/simulator-teaser-thumb.jpg",
    titleKey: "teasers.simulatorTitle",
    subKey: "teasers.simulatorSub",
    durationLabelKey: "teasers.simulatorDuration",
    badge: "diamond",
    ready: true,
  },
];

export function readySecondaryTeasers(): Teaser[] {
  return SECONDARY_TEASERS.filter((t) => t.ready);
}
