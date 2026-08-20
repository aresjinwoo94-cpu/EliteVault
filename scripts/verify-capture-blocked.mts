/**
 * WP-A layer 2 — LIVE verification against the real analyzer agent.
 *
 * Usage:
 *   npx tsx --tsconfig scripts/tests/tsconfig.json scripts/verify-capture-blocked.mts
 *
 * This is deliberately NOT part of `npm run test`. It makes real, paid Gemini
 * calls over the network, so the hermetic suite must not depend on it. Run it
 * when the prompt or the schema around `capture_blocked` changes.
 *
 * # Why it exists
 * Layer 2 is the AUTHORITATIVE half of WP-A — discovery's static pre-check only
 * sees what a plain fetch received, while the capture providers drive real
 * browsers. Everything downstream of `capture_blocked` can be unit-tested, but
 * whether the MODEL actually sets the field cannot: that is a property of the
 * prompt meeting a real image. Shipping it on "the code compiles" would be
 * exactly the kind of unverified claim this whole effort is trying to stop.
 *
 * # The fixtures are real production captures
 * Every image below was captured by the live pipeline and is still in the
 * screenshots bucket. In particular the Cloudflare one is not a mock: it is the
 * capture from a real audit that SUCCEEDED and shipped a 5/100 "score" for a
 * verification screen — the failure WP-A exists to prevent.
 */
import { readFileSync } from "node:fs";

// tsx doesn't load .env.local the way Next does, and the provider reads its
// keys at module load — so this has to happen before the agent is imported.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const k = line.slice(0, line.indexOf("=")).trim();
  const v = line.slice(line.indexOf("=") + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const { runAnalyzerAgent } = await import("../ai/agents/analyzer-agent");

const BUCKET =
  "https://bniqrniajswqvzkhklad.supabase.co/storage/v1/object/public/screenshots/";

interface Fixture {
  name: string;
  file: string;
  mediaType: "image/png" | "image/jpeg";
  url: string;
  /** What `capture_blocked.detected` MUST be for this image. */
  expectBlocked: boolean;
  note: string;
}

const FIXTURES: Fixture[] = [
  {
    name: "brilliantearth — Cloudflare verification screen",
    file: "53698041-5cd0-472e-8edf-c879853f0ce2.png",
    mediaType: "image/png",
    url: "https://www.brilliantearth.com/Beveled-Edge-Matte-5.5mm-Wedding-Ring-in-14K-White-Gold",
    expectBlocked: true,
    note: "The audit that shipped 5/100 for a bouncer. THE case WP-A exists for.",
  },
  {
    name: "brilliantearth — the REAL product page",
    file: "0c51260b-9d2d-4bc8-8a2d-661b93e60b39.jpg",
    mediaType: "image/jpeg",
    url: "https://www.brilliantearth.com/Beveled-Edge-Matte-5.5mm-Wedding-Ring-in-14K-White-Gold",
    expectBlocked: false,
    note: "Same store, same URL, clean capture — the sharpest false-positive test there is.",
  },
  {
    name: "thejerseynation — normal Shopify store",
    file: "92f1166c-0f66-47a2-8705-133755b839f6.png",
    mediaType: "image/png",
    url: "https://www.thejerseynation.com/products/shoot",
    expectBlocked: false,
    note: "Ordinary storefront.",
  },
  {
    name: "vitallivingstore — normal store",
    file: "022f4f42-d9b9-49ea-a669-16c31e02bfab.jpg",
    mediaType: "image/jpeg",
    url: "https://vitallivingstore.com",
    expectBlocked: false,
    note: "Ordinary storefront, different vertical.",
  },
];

async function fetchBase64(file: string): Promise<string> {
  const res = await fetch(BUCKET + file);
  if (!res.ok) throw new Error(`fixture fetch ${res.status} for ${file}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

let failures = 0;

for (const fx of FIXTURES) {
  process.stdout.write(`\n── ${fx.name}\n   ${fx.note}\n`);
  try {
    const base64 = await fetchBase64(fx.file);
    const started = Date.now();
    const audit = await runAnalyzerAgent({
      screenshotBase64: base64,
      mediaType: fx.mediaType,
      url: fx.url,
      // No siteInfo on purpose: this isolates LAYER 2. The model gets only the
      // image, exactly as the brief asked — if it needs discovery's text to
      // notice a full-screen Cloudflare wall, layer 2 isn't doing its job.
      siteInfo: null,
      deadlineAt: Date.now() + 120_000,
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    const detected = audit.capture_blocked?.detected;
    const ok = detected === fx.expectBlocked;
    if (!ok) failures++;

    console.log(`   ${ok ? "PASS" : "FAIL"}  capture_blocked.detected = ${detected} (expected ${fx.expectBlocked})  [${secs}s]`);
    if (audit.capture_blocked?.reason) {
      console.log(`         reason: ${audit.capture_blocked.reason}`);
    }
    console.log(`         score ${audit.score ?? "—"} · ${audit.top_fixes?.length ?? 0} fixes · ${audit.annotations?.length ?? 0} annotations`);
    console.log(`         summary: ${(audit.summary ?? "").slice(0, 150)}`);
  } catch (err) {
    failures++;
    console.log(`   ERROR  ${(err as Error).message}`);
  }
}

// ── Layer 1, live ──────────────────────────────────────────────────────────
//
// Layer 1's coverage is a property of the SITE AND THE MOMENT, not of our code:
// a store behind Cloudflare may serve a challenge to a plain fetch today and a
// clean 200 tomorrow, depending on how its Bot Fight settings are tuned and how
// our IP is scored. So this section reports what it observed rather than
// asserting a fixed expectation — a green run here is evidence, never proof.
//
// brilliantearth.com is included precisely because it does NOT trip layer 1 any
// more: it answers 200 with the full storefront to our bot user-agent. That is
// the whole reason layer 2 has to be the authoritative half.
const { detectChallenge } = await import("../lib/analyzer/challenge-detect");

const LAYER1_URLS = [
  "https://www.aesop.com",
  "https://www.thewhiskyexchange.com",
  "https://www.aritzia.com",
  "https://www.brilliantearth.com",
  "https://www.allbirds.com",
];

console.log("── Layer 1 (static pre-check) — observed, not asserted\n");
for (const url of LAYER1_URLS) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EliteVaultAuditBot/1.0; +https://elitevaultapp.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    const d = detectChallenge(body.slice(0, 200_000));
    console.log(
      `   ${url.padEnd(38)} HTTP ${res.status}  ${String(Math.round(body.length / 1024)).padStart(5)}KB  ` +
        `challenge=${d.detected}${d.vendor ? ` (${d.vendor})` : ""}`,
    );
  } catch (err) {
    console.log(`   ${url.padEnd(38)} fetch failed: ${(err as Error).message}`);
  }
}

console.log(
  `\n${failures === 0 ? "All layer-2 fixtures behaved as required." : `${failures} layer-2 fixture(s) FAILED — layer 2 is not trustworthy yet.`}\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
