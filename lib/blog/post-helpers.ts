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

/**
 * A CTA paragraph: `<p class="blog-cta"><a …>text →</a></p>`.
 * `text` must be specific to the post's topic ("See your store's 7-day ROAS scenarios →") and must not
 * contain the word "free". UTMs: utm_source=blog&utm_medium=inline&utm_campaign=<slug>&utm_content=<position>.
 * `lead` is an optional sentence before the link (plain text or inline HTML).
 */
export function blogCta(slug: string, position: CtaPosition, text: string, opts: { lead?: string; target?: string } = {}): string {
  const target = opts.target ?? BLOG_CTA_TARGET;
  const sep = target.includes("?") ? "&amp;" : "?";
  const href = `${target.replace(/&/g, "&amp;")}${sep}utm_source=blog&amp;utm_medium=inline&amp;utm_campaign=${slug}&amp;utm_content=${position}`;
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
  return `<figure class="my-8 rounded-2xl border border-signal-500/25 bg-card p-5 md:p-6" ${EVIDENCE_ATTR}="in-action">
<div class="text-xs font-semibold uppercase tracking-wide text-signal-300">EliteVault in action</div>
<h3 class="mt-2 text-lg font-semibold text-white">${e.title}</h3>
${e.bodyHtml}
<figcaption class="mt-3 text-xs text-white/35">${label}. Available on: ${e.plan}</figcaption>
</figure>`;
}
