/**
 * Crawler / preview-fetcher detection for /api/track. Kept separate (and
 * tested) because over-matching silently hides real visitors.
 *
 * Deliberately NOT matched: bare "pinterest" (the Pinterest in-app browser UA
 * contains it), "whatsapp"/"preview" as substrings (real in-app browsers carry
 * them). Only the actual fetchers are dropped.
 */
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest\/0\.|slackbot|vkshare|telegrambot|headless|lighthouse|pagespeed|gtmetrix|uptime|monitor|^whatsapp\/|linkpreview|link preview/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  return BOT_RE.test(ua || "");
}
