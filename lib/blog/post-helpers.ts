/**
 * Markup helpers for blog posts written with the `elitevault-blog-writer` skill
 * (.claude/skills/elitevault-blog-writer). They exist so that every post emits the SAME CTA, figure and
 * "EliteVault in action" markup: the UTMs stay correct, the QA script can measure how much of a post is
 * product, and nobody hand-writes an SVG wrapper twice.
 *
 * Pure string builders: no I/O, no React. bodyHtml is rendered with dangerouslySetInnerHTML inside
 * `.article-prose` (app/blog/[slug]/page.tsx).
 */

export type CtaPosition = "early" | "showcase" | "end";

/** Default entry point of every blog CTA: signed-in readers land in the Analyzer, others sign up first. */
export const BLOG_CTA_TARGET = "/sign-up?next=/app/analyzer";

/** Marker classes the QA script (scripts/blog/qa-check.mts) counts. */
export const CTA_CLASS = "blog-cta";
export const EVIDENCE_ATTR = "data-ev";
/** Comment markers around an evidence block, so the QA script can find its end even when the body holds a <figure>. */
export const EV_OPEN = "<!--ev-->";
export const EV_CLOSE = "<!--/ev-->";

/**
 * A CTA paragraph: `<p class="blog-cta"><a …>text →</a></p>`.
 * `text` must be specific to the post's topic ("See your store's 7-day ROAS scenarios →") and must not
 * contain the word "free". UTMs: utm_source=blog&utm_medium=inline&utm_campaign=<slug>&utm_content=<position>.
 * `lead` is an optional sentence before the link (plain text or inline HTML).
 */
export function blogCta(slug: string, position: CtaPosition, text: string, opts: { lead?: string; target?: string } = {}): string {
  const raw = (opts.target ?? BLOG_CTA_TARGET).replace(/&amp;/g, "&");
  const [target, hash] = raw.split("#");
  const sep = target.includes("?") ? "&amp;" : "?";
  const frag = hash ? `#${hash}` : "";
  const href = `${target.replace(/&/g, "&amp;")}${sep}utm_source=blog&amp;utm_medium=inline&amp;utm_campaign=${slug}&amp;utm_content=${position}${frag}`;
  const lead = opts.lead ? `${opts.lead} ` : "";
  return `<p class="${CTA_CLASS}">${lead}<a href="${href}">${text}</a></p>`;
}

export interface FigureInput {
  /** Unique id prefix within the post, e.g. "r1". Used for aria-labelledby. */
  id: string;
  title: string;
  desc: string;
  /** viewBox height; width is always 300 so text of 14px stays legible at 360px. */
  height: number;
  /** SVG children. Teal #2DD4BF accents, no gold, font-size 14 minimum. */
  inner: string;
  caption: string;
}

/** `<figure>` + accessible inline SVG (role="img", <title>, <desc>), centered, max 440px wide. */
export function blogFigure(f: FigureInput): string {
  return `<figure class="my-8 rounded-2xl border border-white/[0.08] bg-card p-5 md:p-6">
<svg viewBox="0 0 300 ${f.height}" width="100%" style="max-width:440px;display:block;margin:0 auto" role="img" aria-labelledby="${f.id}-title ${f.id}-desc"><title id="${f.id}-title">${f.title}</title><desc id="${f.id}-desc">${f.desc}</desc>
${f.inner}</svg>
<figcaption class="mt-3 text-xs text-white/35">${f.caption}</figcaption>
</figure>`;
}

export type EvidenceKind = "audit" | "modeled" | "aggregate" | "library";

const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  audit: "From an EliteVault audit",
  modeled: "From an EliteVault audit (modeled projection, not a result)",
  aggregate: "From EliteVault data",
  library: "From the EliteVault Library",
};

export interface EvidenceInput {
  kind: EvidenceKind;
  /** Short heading, tied to the post's topic. */
  title: string;
  /** Inner HTML: a real output (replica or image) plus what it means and what the reader should do with it. */
  bodyHtml: string;
  /** Which plan unlocks what the block shows, e.g. "Free: the verdict and fix 1. Pro/Scale: the 3-scenario projection." */
  plan: string;
  /** For `aggregate`: the exact sample, e.g. "n = 140 stores, 2026-06-02 to 2026-10-22". */
  sample?: string;
}

/**
 * The "EliteVault in action" block. Always labeled with where the output comes from and which plan shows it.
 * Marked `data-ev="in-action"` so the QA script can compute the product share of the post body (target ≤ ~30%).
 */
export function evidenceBlock(e: EvidenceInput): string {
  const label = e.kind === "aggregate" && e.sample ? `${EVIDENCE_LABEL.aggregate} (${e.sample})` : EVIDENCE_LABEL[e.kind];
  return `${EV_OPEN}<figure class="my-8 rounded-2xl border border-signal-500/25 bg-card p-5 md:p-6" ${EVIDENCE_ATTR}="in-action">
<div class="text-xs font-semibold uppercase tracking-wide text-signal-300">EliteVault in action</div>
<h3 class="mt-2 text-lg font-semibold text-white">${e.title}</h3>
${e.bodyHtml}
<figcaption class="mt-3 text-xs text-white/35">${label}. Available on: ${e.plan}</figcaption>
</figure>${EV_CLOSE}`;
}

// ── Simulator replica ─────────────────────────────────────────────────────────

export interface SimReplicaScenario {
  totals: { spend: number; revenue: number; purchases: number; roas: number; cpa?: number; roas_range: [number, number] };
  /** ROAS per day, 7 values. */
  days_roas: number[];
}
export interface SimReplicaInput {
  /** Unique id prefix for the SVG (aria). */
  id: string;
  aovUsd: number;
  dailyBudgetUsd: number;
  scenarios: { conservative: SimReplicaScenario; balanced: SimReplicaScenario; aggressive: SimReplicaScenario };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const NAMES = { conservative: "Conservative", balanced: "Balanced", aggressive: "Aggressive" } as const;

/**
 * Faithful HTML/SVG replica of the Meta Campaign Scenario Modeler output (7-day totals table + day-by-day ROAS
 * curve) from the stored real values (e.g. docs/blog-data/example-loss-projection.json). Meant to live inside
 * `evidenceBlock({ kind: "modeled", … })`. It never invents a number: everything is read from `scenarios`.
 */
export function simulatorReplica(s: SimReplicaInput): string {
  const keys = ["conservative", "balanced", "aggressive"] as const;
  const rows = keys
    .map((k) => {
      const t = s.scenarios[k].totals;
      return `<tr><td>${NAMES[k]}</td><td>${usd(t.spend)}</td><td>${usd(t.revenue)}</td><td>${Math.round(t.purchases)}</td><td>${t.roas.toFixed(2)}x (${t.roas_range[0].toFixed(2)}–${t.roas_range[1].toFixed(2)}x)</td></tr>`;
    })
    .join("");
  const table = `<table><thead><tr><th>Scenario</th><th>Spend</th><th>Revenue</th><th>Sales</th><th>7-day ROAS (range)</th></tr></thead><tbody>${rows}</tbody></table>`;

  // curve: x = day 1..7 over 0..300 (padding 14), y = ROAS scaled to the larger of 1.2 and the max value
  const max = Math.max(1.2, ...keys.flatMap((k) => s.scenarios[k].days_roas));
  const x = (i: number) => 24 + (i * (300 - 40)) / 6;
  const y = (v: number) => 12 + (1 - v / max) * 150;
  const colors = { conservative: "#2DD4BF", balanced: "rgba(255,255,255,0.75)", aggressive: "rgba(255,255,255,0.4)" } as const;
  const lines = keys
    .map((k) => `<polyline fill="none" stroke="${colors[k]}" stroke-width="2.5" points="${s.scenarios[k].days_roas.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`)
    .join("");
  const one = y(1);
  const legend = keys
    .map((k, i) => `<text x="${24 + i * 92}" y="206" font-size="14" fill="${colors[k]}">${NAMES[k]}</text>`)
    .join("");
  const svg = `<figure class="my-4">
<svg viewBox="0 0 300 214" width="100%" style="max-width:440px;display:block;margin:0 auto" role="img" aria-labelledby="${s.id}-title ${s.id}-desc"><title id="${s.id}-title">Modeled 7-day ROAS by day, three scenarios</title><desc id="${s.id}-desc">Day-by-day modeled ROAS for the conservative, balanced and aggressive scenarios. A dashed line marks 1.0x, where revenue equals ad spend.</desc>
<line x1="24" y1="${one.toFixed(1)}" x2="284" y2="${one.toFixed(1)}" stroke="rgba(255,255,255,0.35)" stroke-dasharray="4 4"/>
<text x="26" y="${(one - 4).toFixed(1)}" font-size="14" fill="rgba(255,255,255,0.6)">1.0x = revenue equals ad spend</text>
${lines}
<text x="24" y="180" font-size="14" fill="rgba(255,255,255,0.6)">Day 1</text><text x="284" y="180" text-anchor="end" font-size="14" fill="rgba(255,255,255,0.6)">Day 7</text>
${legend}</svg>
<figcaption class="mt-2 text-xs text-white/35">Inputs: average order value ${usd(s.aovUsd)}, ${usd(s.dailyBudgetUsd)} a day. Days 1–3 are modeled as Meta's learning phase.</figcaption>
</figure>`;
  return `${table}\n${svg}`;
}
