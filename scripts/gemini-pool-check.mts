/**
 * O-2 — do the Gemini keys actually sit in DIFFERENT Google projects?
 *
 * Usage (locally):
 *   npx tsx --tsconfig scripts/tests/tsconfig.json scripts/gemini-pool-check.mts
 *
 * Usage (against production, which is the one that matters):
 *   vercel env pull .env.production.local
 *   ENV_FILE=.env.production.local npx tsx ... scripts/gemini-pool-check.mts
 *
 * # Why this script has to exist
 * The free tier's 15 RPM is enforced per PROJECT, not per key, so N keys only
 * multiply quota when they come from N different projects. Several keys minted
 * inside one project look identical in the Vercel env list, look identical in
 * the AI Studio key list, and behave identically until the pool is under load —
 * at which point rotation pays one wasted round-trip per sibling key to
 * rediscover the same exhausted bucket.
 *
 * Nothing in a key string reveals its project, and Vercel marks these values
 * Sensitive so they can't be read back. So the question cannot be answered by
 * inspection — only by BEHAVIOUR, which is what this measures.
 *
 * # Method
 * Saturate ONE key until it 429s, then immediately probe every other key. A key
 * that also 429s shares the first one's project quota; a key that answers 200
 * has its own. Costs only free-tier requests, and it uses the smallest possible
 * prompt so it burns requests rather than tokens.
 */
import { readFileSync } from "node:fs";

const ENV_FILE = process.env.ENV_FILE ?? ".env.local";
for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const k = line.slice(0, line.indexOf("=")).trim();
  let v = line.slice(line.indexOf("=") + 1).trim();
  // `vercel env pull` quotes values; .env.local doesn't.
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const keys: { name: string; key: string }[] = [];
if (process.env.GEMINI_API_KEY) {
  keys.push({ name: "GEMINI_API_KEY", key: process.env.GEMINI_API_KEY });
}
for (let i = 2; i <= 10; i++) {
  const v = process.env[`GEMINI_API_KEY_${i}`];
  if (v?.trim()) keys.push({ name: `GEMINI_API_KEY_${i}`, key: v.trim() });
}

console.log(`\nReading ${ENV_FILE} — found ${keys.length} key(s).\n`);
if (keys.length < 2) {
  console.log(
    "Fewer than 2 keys here, so there is nothing to compare. This is expected\n" +
      "for .env.local: the pool lives in Vercel. Pull the production env first —\n" +
      "  vercel env pull .env.production.local\n" +
      "  ENV_FILE=.env.production.local npx tsx ... scripts/gemini-pool-check.mts\n",
  );
  process.exitCode = 0;
} else {
  const MODEL = process.env.GEMINI_MODEL_FAST ?? "gemini-3.1-flash-lite";
  const url = (k: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    generationConfig: { maxOutputTokens: 1 },
  });

  const ping = async (k: string): Promise<number> => {
    try {
      const r = await fetch(url(k), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      return r.status;
    } catch {
      return 0;
    }
  };

  // 1) Saturate the first key. 15 RPM free tier, so ~20 concurrent gets there.
  const victim = keys[0];
  console.log(`Saturating ${victim.name} until it rate-limits…`);
  let saturated = false;
  for (let round = 1; round <= 3 && !saturated; round++) {
    const statuses = await Promise.all(
      Array.from({ length: 20 }, () => ping(victim.key)),
    );
    saturated = statuses.includes(429);
    console.log(
      `  round ${round}: ${statuses.filter((s) => s === 200).length} ok, ` +
        `${statuses.filter((s) => s === 429).length} rate-limited`,
    );
  }

  if (!saturated) {
    console.log(
      "\nCouldn't rate-limit the first key — it may be on a paid tier, or the\n" +
        "limit is higher than this probe. Inconclusive; nothing was proven.\n",
    );
    process.exitCode = 2;
  } else {
    // 2) Probe every other key IMMEDIATELY, while the first is still cooling.
    console.log(`\n${victim.name} is rate-limited. Probing the others now:\n`);
    let shared = 0;
    for (const k of keys.slice(1)) {
      const status = await ping(k.key);
      const verdict =
        status === 429
          ? "SHARES a project with " + victim.name + " — adds no quota"
          : status === 200
            ? "independent project ✓"
            : `inconclusive (HTTP ${status})`;
      if (status === 429) shared++;
      console.log(`  ${k.name.padEnd(20)} ${verdict}`);
    }
    console.log(
      shared === 0
        ? `\n✓ All ${keys.length} keys look independent — the pool is real.\n`
        : `\n✗ ${shared} of ${keys.length - 1} keys share a project with ${victim.name}.\n` +
            `  Replace those with keys minted in NEW Google projects; more keys in\n` +
            `  the same project add rotation cost and no quota.\n`,
    );
    process.exitCode = shared === 0 ? 0 : 1;
  }
}
