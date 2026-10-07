import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyChannel,
  parseLanding,
  normalizeUtmSource,
  channelOfReferrer,
} from "../../lib/analytics/channel";
import { isBotUserAgent } from "../../lib/analytics/bots";

/**
 * docs/owner-monitor-v2.md §3.2 — the channel table. Priority order:
 * utm_source → click ids → referrer domain → in-app UA → Directo.
 */

const IG_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0";
const FB_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0;]";
const TT_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6";
const PIN_APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [Pinterest/iOS]";
const PLAIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36";

const c = (o: Parameters<typeof classifyChannel>[0]) => classifyChannel(o);

test("Google: every google referrer collapses to plain 'Google'", () => {
  for (const referrer of [
    "https://www.google.com.ec/",
    "https://google.com/",
    "https://www.google.es/search?q=x",
    "android-app://com.google.android.googlequicksearchbox",
    "android-app://com.google.android.googlequicksearchbox/",
    "https://www.googleadservices.com/pagead/aclk",
    "https://g.co/kgs/abc",
    "google.com.ec",
  ]) {
    assert.equal(c({ referrer }), "Google", referrer);
  }
});

test("gemini.google.com is Gemini, not Google (assistant exception)", () => {
  assert.equal(c({ referrer: "https://gemini.google.com/app" }), "Gemini");
});

test("social referrers", () => {
  const cases: Array<[string, string]> = [
    ["https://l.instagram.com/?u=x", "Instagram"],
    ["https://www.instagram.com/", "Instagram"],
    ["https://m.facebook.com/", "Facebook"],
    ["https://l.facebook.com/l.php", "Facebook"],
    ["https://lm.facebook.com/", "Facebook"],
    ["https://fb.me/x", "Facebook"],
    ["https://www.tiktok.com/", "TikTok"],
    ["https://vm.tiktok.com/abc", "TikTok"],
    ["https://www.pinterest.com/pin/1", "Pinterest"],
    ["https://www.pinterest.com.mx/", "Pinterest"],
    ["https://pin.it/abc", "Pinterest"],
    ["https://old.reddit.com/r/x", "Reddit"],
    ["https://out.reddit.com/", "Reddit"],
    ["https://redd.it/abc", "Reddit"],
    ["https://t.co/abc", "X"],
    ["https://x.com/a", "X"],
    ["https://twitter.com/a", "X"],
    ["https://m.youtube.com/", "YouTube"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://www.linkedin.com/feed", "LinkedIn"],
    ["https://lnkd.in/x", "LinkedIn"],
    ["https://wa.me/123", "WhatsApp"],
    ["https://web.whatsapp.com/", "WhatsApp"],
    ["https://t.me/x", "Telegram"],
    ["https://discord.com/channels", "Discord"],
    ["https://discord.gg/x", "Discord"],
  ];
  for (const [referrer, want] of cases) assert.equal(c({ referrer }), want, referrer);
});

test("AI assistants and other search engines", () => {
  const cases: Array<[string, string]> = [
    ["https://chatgpt.com/", "ChatGPT"],
    ["https://chat.openai.com/", "ChatGPT"],
    ["https://www.perplexity.ai/search", "Perplexity"],
    ["https://claude.ai/", "Claude"],
    ["https://copilot.microsoft.com/", "Copilot"],
    ["https://www.bing.com/", "Bing"],
    ["https://duckduckgo.com/", "DuckDuckGo"],
    ["https://search.yahoo.com/search", "Yahoo"],
  ];
  for (const [referrer, want] of cases) assert.equal(c({ referrer }), want, referrer);
});

test("email and Shopify Community", () => {
  assert.equal(c({ referrer: "https://mail.google.com/" }), "Email");
  assert.equal(c({ referrer: "https://outlook.live.com/" }), "Email");
  assert.equal(c({ utmMedium: "email", referrer: "" }), "Email");
  assert.equal(c({ referrer: "https://community.shopify.com/t/x" }), "Shopify Community");
});

test("any other referrer shows its clean domain", () => {
  assert.equal(c({ referrer: "https://www.example-blog.com/post" }), "example-blog.com");
});

test("utm_source wins and is normalised", () => {
  assert.equal(c({ utmSource: "ig", referrer: "https://www.google.com/" }), "Instagram");
  assert.equal(c({ utmSource: "Instagram" }), "Instagram");
  assert.equal(c({ utmSource: "pinterest" }), "Pinterest");
  assert.equal(c({ utmSource: "fb" }), "Facebook");
  assert.equal(c({ utmSource: "tiktok" }), "TikTok");
  assert.equal(c({ utmSource: "twitter" }), "X");
  assert.equal(c({ utmSource: "google" }), "Google");
  assert.equal(normalizeUtmSource("  YT "), "YouTube");
});

test("unknown utm_source is kept, cleaned", () => {
  assert.equal(c({ utmSource: "My Newsletter" }), "my newsletter");
});

test("click ids", () => {
  assert.equal(c({ clickIds: ["gclid"] }), "Google");
  assert.equal(c({ clickIds: ["gbraid"] }), "Google");
  assert.equal(c({ clickIds: ["wbraid"] }), "Google");
  assert.equal(c({ clickIds: ["ttclid"] }), "TikTok");
  assert.equal(c({ clickIds: ["epik"] }), "Pinterest");
  assert.equal(c({ clickIds: ["rdt_cid"] }), "Reddit");
  assert.equal(c({ clickIds: ["twclid"] }), "X");
  assert.equal(c({ clickIds: ["li_fat_id"] }), "LinkedIn");
  assert.equal(c({ clickIds: ["msclkid"] }), "Bing");
});

test("fbclid → Instagram inside the Instagram in-app browser, else Facebook", () => {
  assert.equal(c({ clickIds: ["fbclid"], ua: IG_UA }), "Instagram");
  assert.equal(c({ clickIds: ["fbclid"], ua: FB_UA }), "Facebook");
  assert.equal(c({ clickIds: ["fbclid"], ua: PLAIN_UA }), "Facebook");
});

test("click id beats referrer", () => {
  assert.equal(c({ clickIds: ["ttclid"], referrer: "https://www.google.com/" }), "TikTok");
});

test("in-app browser UA when the referrer is empty", () => {
  assert.equal(c({ referrer: "", ua: IG_UA }), "Instagram");
  assert.equal(c({ referrer: "", ua: FB_UA }), "Facebook");
  assert.equal(c({ referrer: "", ua: "x FBAN/FBIOS;FBAV/1" }), "Facebook");
  assert.equal(c({ referrer: "", ua: TT_UA }), "TikTok");
  assert.equal(c({ referrer: "", ua: PIN_APP_UA }), "Pinterest");
  assert.equal(c({ referrer: "", ua: "Mozilla/5.0 Snapchat/12.0" }), "Snapchat");
  assert.equal(c({ referrer: "", ua: "Mozilla/5.0 LinkedInApp" }), "LinkedIn");
});

test("referrer beats in-app UA", () => {
  assert.equal(c({ referrer: "https://www.google.com/", ua: IG_UA }), "Google");
});

test("nothing → Directo", () => {
  assert.equal(c({}), "Directo");
  assert.equal(c({ referrer: "", ua: PLAIN_UA }), "Directo");
  assert.equal(c({ referrer: "not a url ???" }), "Directo");
});

test("channelOfReferrer on a bare host with www", () => {
  assert.equal(channelOfReferrer("www.reddit.com"), "Reddit");
  assert.equal(channelOfReferrer(""), null);
});

test("parseLanding extracts utm + click ids from location.search", () => {
  const p = parseLanding("?utm_source=instagram&utm_medium=social&utm_campaign=Bio&fbclid=abc&x=1");
  assert.equal(p.utmSource, "instagram");
  assert.equal(p.utmMedium, "social");
  assert.equal(p.utmCampaign, "Bio");
  assert.deepEqual(p.clickIds, ["fbclid"]);
  assert.deepEqual(parseLanding("").clickIds, []);
  assert.equal(parseLanding(undefined).utmSource, null);
});

test("bots: Pinterest crawler is a bot, the Pinterest in-app browser is not", () => {
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)"), true);
  assert.equal(isBotUserAgent("Pinterest/0.2 (+http://www.pinterest.com/bot.html)"), true);
  assert.equal(isBotUserAgent(PIN_APP_UA), false);
  assert.equal(isBotUserAgent("Googlebot/2.1"), true);
  assert.equal(isBotUserAgent("facebookexternalhit/1.1"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 (Linux; Android 13) WhatsApp/2.23"), false);
  assert.equal(isBotUserAgent("WhatsApp/2.23.20 A"), true);
  assert.equal(isBotUserAgent(IG_UA), false);
  assert.equal(isBotUserAgent(PLAIN_UA), false);
});
