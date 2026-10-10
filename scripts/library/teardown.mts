/**
 * Library teardown generator (owner decision 2026-10-09: the `competitor` Fix Track needs
 * at least one teardown per niche, and 9 of 13 niches had none).
 *
 *   npm run library:teardown -- --missing            → 1 teardown for every niche that has none
 *   npm run library:teardown -- --niche skincare     → one niche
 *   npm run library:teardown -- --missing --dry      → generate + print, write nothing
 *   (add --shots <dir> to also save each capture for human review)
 *
 * Picks, per niche, the highest-momentum PUBLISHED + LIVE store that has no teardown,
 * captures its page, and asks the vision model for a teardown in the Library's existing
 * shape (lib/supabase/types.ts → Teardown): a one-line summary + 3-5 elements, each tied
 * to one of the Analyzer's 6 dimensions, each with a factual `observation` and an
 * actionable `takeaway`.
 *
 * Guardrails, because this describes THIRD-PARTY stores to paying users:
 *   • observations must describe what is VISIBLE on the captured page — the prompt forbids
 *     revenue/traffic/conversion claims and anything not on screen;
 *   • strict validation in code (dimension ∈ the 6, lengths, ≥ 3 elements, banned phrases);
 *     anything weaker is rejected and nothing is written;
 *   • never overwrites an existing teardown (they were hand-curated).
 *   • English only, like the existing ones.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { serviceClient, arg, hasFlag, requireExpansionColumns, exitWith } from "./_shared.mts";
import { captureScreenshot } from "../../lib/screenshot-core.ts";
import { getProvider } from "../../ai/provider.ts";
import { NICHE_LABELS } from "../../lib/library/niches.ts";

const DIMENSIONS = [
  "color_integration",
  "layout_proportion",
  "image_quality",
  "technical_optimization",
  "niche_coherence",
  "cro_principles",
] as const;
type Dimension = (typeof DIMENSIONS)[number];

interface Teardown {
  summary: string;
  elements: { element: string; dimension: Dimension; observation: string; takeaway: string }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    page_readable: { type: "boolean" },
    summary: { type: "string" },
    elements: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          element: { type: "string" },
          dimension: { type: "string", enum: [...DIMENSIONS] },
          observation: { type: "string" },
          takeaway: { type: "string" },
        },
        required: ["element", "dimension", "observation", "takeaway"],
      },
    },
  },
  required: ["page_readable", "summary", "elements"],
} as const;

// (1) Business claims about a third party: never allowed anywhere — rejects the whole teardown.
const BUSINESS = /\b(revenue|traffic|visitors per|conversion rate|converts at|per month|million|sales volume|market share)\b|\/mo/i;
// (2) EPHEMERAL content (promos, dates, launches, numbers) that is stale in weeks: an element that
// contains it is DROPPED (we need >= 3 clean ones); a summary that contains it rejects the teardown.
const EPHEMERAL =
  /\b(coming soon|waitlist|pre-?order|black friday|cyber monday|sale|ends|limited[- ]time|new launch|launch(ing)?|gifted|redeem|giveaway|promo(tion|tional)?|discount(ed)?|off|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|spring|summer|autumn|winter|holiday|season(al)?)\b|[$€£%]|\d/i;

function validate(raw: unknown): Teardown | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { page_readable?: unknown; summary?: unknown; elements?: unknown };
  // A consent wall / modal / blank render hides the page: nothing real to break down.
  if (o.page_readable !== true) return null;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  if (summary.length < 20 || summary.length > 220 || BUSINESS.test(summary) || EPHEMERAL.test(summary)) return null;
  if (!Array.isArray(o.elements) || o.elements.length < 3) return null;
  const elements: Teardown["elements"] = [];
  for (const e of o.elements.slice(0, 5)) {
    if (!e || typeof e !== "object") continue;
    const x = e as Record<string, unknown>;
    const element = typeof x.element === "string" ? x.element.trim() : "";
    const observation = typeof x.observation === "string" ? x.observation.trim() : "";
    const takeaway = typeof x.takeaway === "string" ? x.takeaway.trim() : "";
    const dimension = x.dimension as Dimension;
    if (!DIMENSIONS.includes(dimension)) continue;
    if (element.length < 3 || element.length > 60) continue;
    if (observation.length < 15 || observation.length > 200 || takeaway.length < 15 || takeaway.length > 200) continue;
    const text = `${element} ${observation} ${takeaway}`;
    if (BUSINESS.test(text)) return null;
    if (EPHEMERAL.test(text)) continue; // drop just this element
    elements.push({ element, dimension, observation, takeaway });
  }
  if (elements.length < 3) return null;
  // A teardown that only talks about one dimension isn't a breakdown.
  if (new Set(elements.map((e) => e.dimension)).size < 2) return null;
  return { summary, elements };
}

const svc = serviceClient();
await requireExpansionColumns(svc);
const dry = hasFlag("--dry");
const only = arg("--niche");
const shotsDir = arg("--shots");
if (shotsDir) mkdirSync(resolve(shotsDir), { recursive: true });

const { data, error } = await svc
  .from("winning_sites")
  .select("id, url, domain, title, niche, teardown, momentum_score, status, is_live")
  .eq("status", "published")
  .eq("is_live", true)
  .order("momentum_score", { ascending: false, nullsFirst: false });
if (error) {
  console.error(`✗ could not read winning_sites: ${error.message}`);
  await exitWith(1);
}
type Row = { id: string; url: string; domain: string; title: string | null; niche: string; teardown: unknown };
const rows = (data ?? []) as unknown as Row[];

const niches = Object.keys(NICHE_LABELS).filter((n) => (only ? n === only : true));
const MAX_TRIES = 3;
const targets: Row[][] = []; // per niche: ranked candidates
for (const n of niches) {
  const inNiche = rows.filter((r) => r.niche === n);
  if (inNiche.some((r) => r.teardown) && !only) continue; // --missing semantics: already covered
  const cands = inNiche.filter((r) => !r.teardown).slice(0, MAX_TRIES);
  if (cands.length) targets.push(cands);
}
console.log(`\nGenerating ${targets.length} teardown(s)${dry ? " (dry run)" : ""} for: ${targets.map((t) => t[0].niche).join(", ")}\n`);

const provider = await getProvider();
let written = 0;
for (const cands of targets) {
  for (const t of cands) {
  process.stdout.write(`▸ ${t.niche.padEnd(12)} ${t.domain} … `);
  try {
    const shot = await captureScreenshot(t.url, { budgetMs: 45_000 });
    if (shotsDir) {
      const ext = shot.mediaType === "image/png" ? "png" : "jpg";
      writeFileSync(resolve(shotsDir, `${t.domain}.${ext}`), Buffer.from(shot.base64, "base64"));
    }
    const raw = await provider.generateStructured<unknown>(
      {
        name: "submit_teardown",
        description: "Submit a conversion teardown of this store page.",
        schema: SCHEMA as unknown as Record<string, unknown>,
      },
      {
        system:
          "You are a senior ecommerce conversion analyst writing a TEARDOWN of a winning store for other merchants. " +
          "Describe ONLY what is visibly on the screenshot (hero, offer, navigation, social proof, imagery, colours, CTAs). " +
          "First set page_readable=false (and keep the other fields minimal) if a cookie/consent banner, popup, modal or blank/loading render hides most of the page — only a clearly visible storefront counts. Never state or guess revenue, traffic, conversion rates, ad spend or anything not on screen. Write EVERGREEN observations about durable structure and design choices (layout, hierarchy, navigation, trust and social-proof placement, imagery style, CTA treatment, colour use, product-page patterns). Do NOT mention any number, price, percentage, date, month, season, discount, promo code, giveaway, launch, countdown or limited-time offer — those change weekly; describe the PATTERN (e.g. 'a top announcement bar states the shipping incentive') instead. " +
          "Output: summary = ONE line (≤ 200 chars) on why this page converts. elements = 3 to 5 items, each with a short `element` name (e.g. 'Hero CTA'), " +
          "a `dimension` from the enum, an `observation` (what this store visibly does, ≤ 180 chars, factual) and a `takeaway` (how another store can apply it, ≤ 180 chars, concrete). " +
          "Cover at least two different dimensions. English.",
        temperature: 0.3,
        maxTokens: 1200,
        fast: false,
        deadlineAt: Date.now() + 45_000,
        parts: [
          { mediaType: shot.mediaType, base64: shot.base64 },
          { text: `Store: ${t.title ?? t.domain} (${t.domain}), niche: ${NICHE_LABELS[t.niche]?.label ?? t.niche}. Write the teardown.` },
        ],
      },
    );
    const td = validate(raw);
    if (!td) {
      console.log("✗ rejected (page not readable / ephemeral or numeric content / weak) — trying the next store");
      continue;
    }
    console.log(`✓ ${td.elements.length} elements — ${td.summary}`);
    for (const e of td.elements) console.log(`     [${e.dimension}] ${e.element}: ${e.observation}`);
    if (!dry) {
      const { error: upErr } = await svc.from("winning_sites").update({ teardown: td }).eq("id", t.id).is("teardown", null);
      if (upErr) throw new Error(upErr.message);
      written++;
    }
    break; // one teardown per niche is enough
  } catch (err) {
    console.log(`✗ ${(err as Error).message.slice(0, 120)}`);
  }
  }
}
console.log(`\nDone. written=${written}/${targets.length}${dry ? " (dry run — nothing written)" : ""}\n`);
await exitWith(0);
