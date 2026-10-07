/**
 * Traffic-channel classifier (docs/owner-monitor-v2.md §3.2). Pure — no I/O —
 * so the whole table is unit-tested. Add a channel by adding ONE row to
 * REFERRER_RULES (and, if it has a utm alias, to UTM_ALIASES).
 *
 * Priority: utm_source → click ids → referrer domain → in-app UA → "Directo".
 */

export type Channel = string;

export const DIRECT: Channel = "Directo";

/** Hostname regex → channel. Matched on the host with `www.` stripped. */
const REFERRER_RULES: Array<[RegExp, Channel]> = [
  // Assistants first: gemini.google.com must not fall into the Google rule.
  [/^gemini\.google\.com$/, "Gemini"],
  [/^(chatgpt\.com|chat\.openai\.com)$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/^claude\.ai$/, "Claude"],
  [/^copilot\.microsoft\.com$/, "Copilot"],
  // Email before Google (mail.google.com).
  [/^(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com)$/, "Email"],
  [/^community\.shopify\.com$/, "Shopify Community"],
  // Google — always plain "Google": no mobile/PC, country or organic/paid split.
  [/^android-app:com\.google\.android\.googlequicksearchbox$/, "Google"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)googleadservices\.com$/, "Google"],
  [/^g\.co$/, "Google"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.com)$/, "Facebook"],
  [/^fb\.me$/, "Facebook"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)pinterest\.[a-z.]+$/, "Pinterest"],
  [/^pin\.it$/, "Pinterest"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/^redd\.it$/, "Reddit"],
  [/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/, "X"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  [/^youtu\.be$/, "YouTube"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/^lnkd\.in$/, "LinkedIn"],
  [/^(wa\.me|whatsapp\.com|web\.whatsapp\.com)$/, "WhatsApp"],
  [/^(t\.me|telegram\.org|web\.telegram\.org)$/, "Telegram"],
  [/^(discord\.com|discord\.gg|discordapp\.com)$/, "Discord"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/^duckduckgo\.com$/, "DuckDuckGo"],
  [/^search\.yahoo\.com$/, "Yahoo"],
];

/** utm_source aliases → canonical channel (lower-cased keys). */
const UTM_ALIASES: Record<string, Channel> = {
  ig: "Instagram", instagram: "Instagram",
  fb: "Facebook", facebook: "Facebook",
  tiktok: "TikTok", tt: "TikTok",
  pinterest: "Pinterest", pin: "Pinterest",
  reddit: "Reddit",
  x: "X", twitter: "X",
  yt: "YouTube", youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp", wa: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  email: "Email", newsletter: "Email",
  chatgpt: "ChatGPT", perplexity: "Perplexity", claude: "Claude", gemini: "Gemini", copilot: "Copilot",
  snapchat: "Snapchat",
};

/** Click-id query params → channel. fbclid is resolved separately (needs UA). */
const CLICK_ID_CHANNEL: Record<string, Channel> = {
  gclid: "Google", gbraid: "Google", wbraid: "Google",
  ttclid: "TikTok",
  epik: "Pinterest",
  rdt_cid: "Reddit",
  twclid: "X",
  li_fat_id: "LinkedIn",
  msclkid: "Bing",
};
const CLICK_ID_PARAMS = [...Object.keys(CLICK_ID_CHANNEL), "fbclid"];

/** In-app browser fingerprints, used when the referrer is empty. */
const IN_APP_UA: Array<[RegExp, Channel]> = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Pinterest/i, "Pinterest"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
];

function hostOf(referrer: string): string | null {
  const r = referrer.trim();
  if (!r) return null;
  const app = /^android-app:\/\/([^/?#]+)/i.exec(r);
  if (app) return "android-app:" + app[1].toLowerCase();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(r) ? r : "https://" + r);
    const h = url.hostname.toLowerCase().replace(/^www\./, "");
    return h.includes(".") ? h : null;
  } catch {
    return null;
  }
}

/** Referrer URL or bare host → channel, or null when there is none. */
export function channelOfReferrer(referrer: string | null | undefined, ownHosts: string[] = []): Channel | null {
  const host = hostOf(referrer || "");
  if (!host) return null;
  const own = ownHosts.map((h) => h.toLowerCase().replace(/^www\./, ""));
  if (own.includes(host)) return null;
  for (const [re, ch] of REFERRER_RULES) if (re.test(host)) return ch;
  return host;
}

export function normalizeUtmSource(src: string | null | undefined): Channel | null {
  const s = (src || "").trim().toLowerCase();
  if (!s) return null;
  return UTM_ALIASES[s] ?? s;
}

export type ClassifyInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  /** Names of click-id params present on the landing URL (e.g. ["fbclid"]). */
  clickIds?: string[] | null;
  referrer?: string | null;
  ua?: string | null;
  /** Hosts of this site; a referrer from them is not a channel. */
  ownHosts?: string[];
};

export function classifyChannel(i: ClassifyInput): Channel {
  const utm = normalizeUtmSource(i.utmSource);
  if (utm) return utm;
  if ((i.utmMedium || "").trim().toLowerCase() === "email") return "Email";

  const ua = i.ua || "";
  const ids = i.clickIds || [];
  for (const id of ids) {
    if (id === "fbclid") continue;
    if (CLICK_ID_CHANNEL[id]) return CLICK_ID_CHANNEL[id];
  }
  if (ids.includes("fbclid")) return /Instagram/i.test(ua) ? "Instagram" : "Facebook";

  const ref = channelOfReferrer(i.referrer, i.ownHosts);
  if (ref) return ref;

  for (const [re, ch] of IN_APP_UA) if (re.test(ua)) return ch;
  return DIRECT;
}

export type Landing = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  clickIds: string[];
};

/** Parse `location.search` of the landing URL. */
export function parseLanding(search: string | null | undefined): Landing {
  const out: Landing = { utmSource: null, utmMedium: null, utmCampaign: null, clickIds: [] };
  if (!search) return out;
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(search);
  } catch {
    return out;
  }
  const clean = (v: string | null) => (v ? v.trim().slice(0, 120) || null : null);
  out.utmSource = clean(p.get("utm_source"));
  out.utmMedium = clean(p.get("utm_medium"));
  out.utmCampaign = clean(p.get("utm_campaign"));
  out.clickIds = CLICK_ID_PARAMS.filter((k) => p.has(k));
  return out;
}
