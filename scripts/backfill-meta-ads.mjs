/**
 * Backfills meta_ads on succeeded analyses that don't have it yet —
 * needed for users whose audits ran BEFORE the Meta Ads agent went live.
 *
 * Calls Gemini directly (bypasses the `server-only` import that blocks
 * standalone Node execution of /ai/agents/*).
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const { createClient } = await import("@supabase/supabase-js");
const { GoogleGenAI, Type } = await import("@google/genai");

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const SYSTEM = `You are EliteVault's Meta Ads Optimizer — a senior media buyer
with 8+ years scaling DTC ecommerce on Meta. You think in CAC and breakeven
ROAS, not vanity metrics.

Output realistic Meta Ads targets for THIS store given THIS audit.
- Targets must reflect the audit. A low-score store cannot hit 4x ROAS on
  cold traffic — adjust expectations honestly.
- CTR/CVR are decimals 0..1 (0.02 = 2%).
- 3-5 creatives, each with a distinct angle.
- testing_plan is sequential.
- ALWAYS include 2+ caveats. NEVER guarantee outcomes.`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    niche: { type: Type.STRING },
    audience_seed: { type: Type.STRING },
    budget_band: {
      type: Type.OBJECT,
      properties: {
        daily_min: { type: Type.NUMBER },
        daily_max: { type: Type.NUMBER },
        currency: { type: Type.STRING },
      },
      required: ["daily_min", "daily_max", "currency"],
    },
    targets: {
      type: Type.OBJECT,
      properties: {
        cpc: { type: Type.NUMBER },
        cpm: { type: Type.NUMBER },
        ctr: { type: Type.NUMBER },
        roas: { type: Type.NUMBER },
        cvr: { type: Type.NUMBER },
      },
      required: ["cpc", "cpm", "ctr", "roas", "cvr"],
    },
    creatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          angle: { type: Type.STRING },
          hook: { type: Type.STRING },
          cta: { type: Type.STRING },
          format: { type: Type.STRING, enum: ["single-image", "carousel", "ugc-video", "demo-video"] },
        },
        required: ["angle", "hook", "cta", "format"],
      },
    },
    targeting: {
      type: Type.OBJECT,
      properties: {
        interests: { type: Type.ARRAY, items: { type: Type.STRING } },
        custom_audiences: { type: Type.ARRAY, items: { type: Type.STRING } },
        exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["interests", "custom_audiences", "exclusions"],
    },
    testing_plan: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.STRING },
          budget: { type: Type.NUMBER },
          days: { type: Type.NUMBER },
        },
        required: ["step", "budget", "days"],
      },
    },
    caveats: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["niche", "audience_seed", "budget_band", "targets", "creatives", "targeting", "testing_plan", "caveats"],
};

const GRANTS = { free: 0, pro: 40, scale: 200 };

const { data: rows } = await svc
  .from("analyses")
  .select("id, user_id, url, result, buyer_persona")
  .eq("status", "succeeded")
  .is("meta_ads", null);

if (!rows || rows.length === 0) {
  console.log("✓ Nothing to backfill.");
  process.exit(0);
}

const userIds = [...new Set(rows.map((r) => r.user_id))];
const { data: profs } = await svc.from("profiles").select("id, plan").in("id", userIds);
const planByUser = new Map((profs ?? []).map((p) => [p.id, p.plan]));

const scaleRows = rows.filter((r) => planByUser.get(r.user_id) === "scale");
console.log(`Backfilling ${scaleRows.length} analyses…\n`);

for (const r of scaleRows) {
  if (!r.url || !r.result) {
    console.log(`  ✗ ${r.id} — missing url/result`);
    continue;
  }
  const niche = (() => {
    try { return new URL(r.url).hostname.replace("www.", "").split(".")[0]; }
    catch { return "ecommerce"; }
  })();

  const prompt = [
    `Store URL: ${r.url}`,
    `Niche guess: ${niche}`,
    `Overall score: ${r.result.score}/100`,
    "",
    "Audit summary:",
    r.result.summary,
    "",
    "Top fixes (in order of impact):",
    (r.result.top_fixes ?? []).slice(0, 5).map((f, i) => `  ${i + 1}. ${f.title} [${f.impact}]`).join("\n"),
    "",
    r.buyer_persona ? `Buyer persona:\n${JSON.stringify(r.buyer_persona, null, 2)}` : "Buyer persona: not specified.",
    "",
    "Produce Meta Ads targets, creatives, targeting and testing plan.",
  ].join("\n");

  try {
    console.log(`  → ${r.url}…`);
    const t0 = Date.now();
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL ?? "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM,
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    });
    const meta = JSON.parse(res.text);
    await svc.from("analyses").update({ meta_ads: meta }).eq("id", r.id);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`    ✓ saved in ${dt}s — ROAS ${meta.targets.roas}x · CPC $${meta.targets.cpc} · CTR ${(meta.targets.ctr * 100).toFixed(2)}%`);
  } catch (err) {
    console.log(`    ✗ ${String(err.message ?? err).slice(0, 150)}`);
  }
}

console.log("\nDone. Refresh /app/analyzer/<id> to see the Meta Ads panel.\n");
