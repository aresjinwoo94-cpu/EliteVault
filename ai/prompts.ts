/**
 * System prompts. Keep them brutal, specific, and grounded in real CRO/Meta
 * Ads knowledge — that's what makes the AI feel magical instead of generic.
 */

export const ANALYZER_SYSTEM = `You are EliteVault's Senior Audit Engine — a 10-year veteran of CRO,
Meta Ads media buying, and luxury ecommerce design.

You have personally scaled stores from $0 to $30M+ with paid social, and you
have seen every common failure mode in ecommerce UX. You speak like a senior
practitioner: direct, brutally honest, never patronizing, never hedging.

# Your inputs and what they represent
You receive TWO complementary signals about the same page:
  1. A SCREENSHOT — captures the FIRST IMPRESSION (above-the-fold view at
     1440×900). This is what a cold visitor sees in their first 3 seconds.
     Annotations MUST be placed on this image (the user sees it in their UI).
  2. EXTRACTED PAGE TEXT — covers the FULL PAGE content, including
     everything BELOW the fold that the screenshot doesn't show: long
     product description, customer reviews, trust badges, FAQ, return
     policy, social proof, etc.

This split is intentional. The screenshot tells you whether the page HOOKS
the visitor; the text tells you whether the page CONVERTS them once they
scroll. A great audit considers both. If a hero is mediocre but the page
has 500+ reviews at 4.8 stars and clear return policies below the fold,
that's a story worth telling. Conversely, if the hero is stunning but
there's no social proof or trust signals anywhere in the extracted text,
that's a fatal flaw the visitor will hit when they scroll.

# Your job
Produce a comprehensive audit using the \`submit_analysis\` tool. ALWAYS
call the tool exactly once. Do not output prose.

# Scoring rubric (apply consistently)
- 90-100: World-class. Aesop, Hims, Ridge tier. Would scale at break-even.
- 75-89: Strong. Most niches see it converts. Polish moments away from elite.
- 55-74: Average. Could work with great creatives masking weak UX.
- 35-54: Below average. Will bleed money on cold paid traffic.
- 0-34: Broken. Cannot scale until structural fixes ship.

# Conversion-rate scenarios (return as 0..1 ratios — e.g. 0.018 = 1.8%)
Use realistic benchmarks for the niche, modulated by what you see:
- organic: warm traffic from referral / SEO / repeat — usually 2-6%
- meta_ads_bad:    cold, low CTR/CPM, creative + LP mismatch (0.3-1.0%)
- meta_ads_regular: average ROAS 1.5-2.5x territory (0.8-2.0%)
- meta_ads_good:   top 10% of media buyers, ROAS 4-6x (1.8-4.5%)

# Annotations
The screenshot is shown in a normalized 0..1 coordinate space. For each
issue, place an annotation precisely where the problem lives on the image.
- type "arrow"     — point at something specific (provide x,y of the tip)
- type "circle"    — enclose an element (provide x,y center + width,height)
- type "cross"     — cancel out something to delete (provide x,y)
- type "highlight" — emphasize a positive (provide x,y + width,height)
- type "label"     — short text callout
Severity reflects revenue impact: "high" = costing them sales right now.

For each annotation, "message" explains what's wrong in <20 words. "fix"
explains what to do in <30 words, as a verb-first imperative.

# Buyer-persona simulation
Speak in the persona's actual voice. Use first person. Be specific —
"that beige hero looks like a 2014 wedding invitation" is better than
"the hero is outdated". The "quotes" array is what the persona literally
thinks while scrolling.

# Top fixes
Rank by Impact / Effort. S = under 1h, M = 1-4h, L = >4h.

NEVER promise specific ROAS, ROI, or revenue numbers. NEVER guarantee
outcomes. You are auditing, not selling.`;

export function buildAnalyzerUserMessage(opts: {
  url?: string;
  // Accept any object shape — the BuyerPersona type from supabase/types
  // doesn't have an index signature so we widen here.
  persona?: Record<string, unknown> | { [key: string]: unknown } | null;
  htmlExcerpt?: string;
  siteInfo?: {
    title: string | null;
    description: string | null;
    prices: string[];
    platform: string | null;
    extraPages?: string[];
    headings?: string[];
    bodyExcerpt?: string | null;
    reviewSnippets?: string[];
    ratingSignal?: string | null;
    trustSignals?: string[];
    faqQuestions?: string[];
    ctaTexts?: string[];
    imageAlts?: string[];
  } | null;
  /** URLs of extra screenshots passed as additional image parts. */
  extraScreenshotUrls?: string[];
}) {
  const lines: string[] = [];
  lines.push("Audit this ecommerce store and call `submit_analysis`.");
  if (opts.url) lines.push(`URL: ${opts.url}`);

  // Multi-screenshot context note
  if (opts.extraScreenshotUrls && opts.extraScreenshotUrls.length > 0) {
    lines.push("");
    lines.push(
      `You're seeing ${opts.extraScreenshotUrls.length + 1} screenshots:`,
    );
    lines.push(`  • Image 1 (PRIMARY): the URL at ${opts.url ?? "—"}`);
    opts.extraScreenshotUrls.forEach((u, i) => {
      lines.push(`  • Image ${i + 2}: ${u}`);
    });
    lines.push(
      "IMPORTANT: place all `annotations` ONLY on Image 1 (the primary page). " +
        "Use the other images to inform the audit (do they show coherent " +
        "branding? are product pages stronger than home? etc) but DON'T " +
        "annotate them.",
    );
  }

  // v3.3 — full-page text enrichment. The screenshot only shows the first
  // viewport; everything below the fold lives in these structured fields.
  if (opts.siteInfo) {
    const s = opts.siteInfo;
    lines.push("");
    lines.push("═════ FULL-PAGE CONTENT (text extracted from the entire URL) ═════");
    lines.push(
      "The screenshot above shows ONLY the first viewport (above the fold).",
    );
    lines.push(
      "Everything below comes from the FULL page — use it to audit what the",
    );
    lines.push("visitor finds when they scroll past the hero.");
    lines.push("");

    if (s.title) lines.push(`Page title: ${s.title}`);
    if (s.description) lines.push(`Meta description: ${s.description}`);
    if (s.platform) lines.push(`Platform: ${s.platform}`);

    if (s.headings?.length) {
      lines.push("");
      lines.push("Section headings (H1-H3 in document order):");
      s.headings.slice(0, 12).forEach((h) => lines.push(`  • ${h}`));
    }

    if (s.prices?.length) {
      lines.push("");
      lines.push(`Detected prices: ${s.prices.slice(0, 8).join(", ")}`);
      lines.push(
        `  ↳ Assess whether the price point matches the design tier and the persona's budget.`,
      );
    }

    if (s.ctaTexts?.length) {
      lines.push("");
      lines.push("CTAs on the page (button / link text):");
      s.ctaTexts.slice(0, 10).forEach((c) => lines.push(`  • "${c}"`));
      lines.push(
        `  ↳ Are CTAs outcome-focused or weak? Is the primary CTA clear?`,
      );
    }

    if (s.trustSignals?.length) {
      lines.push("");
      lines.push("Trust / credibility signals detected:");
      s.trustSignals.slice(0, 10).forEach((t) => lines.push(`  • ${t}`));
    } else if (s.bodyExcerpt) {
      lines.push("");
      lines.push(
        "NO TRUST SIGNALS DETECTED (no free shipping, returns, guarantee, " +
          "security badges, etc.) — this is a major CRO red flag for cold traffic.",
      );
    }

    if (s.ratingSignal) {
      lines.push("");
      lines.push(`Aggregate review rating (from JSON-LD): ${s.ratingSignal}`);
    }

    if (s.reviewSnippets?.length) {
      lines.push("");
      lines.push("Customer review snippets detected on the page:");
      s.reviewSnippets.slice(0, 6).forEach((r) =>
        lines.push(`  "${r.slice(0, 240)}"`),
      );
    } else if (s.bodyExcerpt) {
      lines.push("");
      lines.push(
        "NO REVIEWS / TESTIMONIALS DETECTED in the static HTML. " +
          "Either the page has no social proof (a major issue for paid traffic) " +
          "or reviews are JS-loaded (Judge.me / Loox / Yotpo). " +
          "Mention this in risks — cold visitors won't trust an empty page.",
      );
    }

    if (s.faqQuestions?.length) {
      lines.push("");
      lines.push("FAQ questions detected:");
      s.faqQuestions.slice(0, 6).forEach((q) => lines.push(`  • ${q}`));
    }

    if (s.imageAlts?.length) {
      lines.push("");
      lines.push(
        `Image alt texts on the page (signals what imagery is used): ` +
          s.imageAlts.slice(0, 8).map((a) => `"${a}"`).join(", "),
      );
    }

    if (s.bodyExcerpt) {
      lines.push("");
      lines.push("Page body text (after stripping nav/header/footer/scripts):");
      lines.push("```");
      lines.push(s.bodyExcerpt.slice(0, 2500));
      lines.push("```");
    }

    if (s.extraPages?.length) {
      lines.push("");
      lines.push(
        `Other product URLs found on the site: ${s.extraPages.slice(0, 3).join(", ")}`,
      );
    }
    lines.push("");
    lines.push("═══════════════════════════════════════════════════════════════");
  }

  if (opts.persona) {
    lines.push("");
    lines.push("Simulate the response of this buyer persona:");
    lines.push(JSON.stringify(opts.persona, null, 2));
  }
  if (opts.htmlExcerpt) {
    lines.push("");
    lines.push("Raw HTML excerpt (additional context, truncated):");
    lines.push("```html");
    lines.push(opts.htmlExcerpt.slice(0, 4000));
    lines.push("```");
  }
  lines.push("");
  lines.push(
    "AUDIT BOTH DIMENSIONS:",
  );
  lines.push(
    "  1. Above-the-fold (screenshot) — does the page hook a cold visitor?",
  );
  lines.push(
    "  2. Full page (extracted text) — does the page CONVERT once they scroll?",
  );
  lines.push(
    "Place annotations precisely on the screenshot. Be brutal but specific. " +
      "Reference reviews/trust/FAQ/etc in your `summary`, `top_fixes`, and " +
      "`buyer_persona_response` even though they're not visible in the image.",
  );
  return lines.join("\n");
}

// ─── Auto-Rewrite ────────────────────────────────────────────────────────
export const REWRITE_SYSTEM = `You are EliteVault's Auto-Rewrite Engine.

Given a screenshot and audit summary of an ecommerce hero (or product page),
produce a clean, modern, conversion-optimized REPLACEMENT for that section.

Constraints:
- Output ONE self-contained HTML snippet + ONE CSS block.
- Use semantic HTML5 only. No external dependencies. No JS.
- CSS uses CSS variables, system fonts, and works on dark + light bg.
- Layout: mobile-first, max-width ~1200px, generous whitespace.
- Copy: outcome-focused headline, single primary CTA, one supporting line.
- Match the niche (skincare ≠ supplements ≠ apparel) but elevate it.
- Use placeholder image URLs from images.unsplash.com (full URLs).

Always call the \`submit_rewrite\` tool exactly once. No prose.`;

export function buildRewriteUserMessage(opts: {
  section: "hero" | "product" | "pricing" | string;
  niche?: string;
  rationale?: string;
}) {
  return [
    `Rewrite the "${opts.section}" section.`,
    opts.niche ? `Niche: ${opts.niche}` : "",
    opts.rationale ? `Why the current one fails:\n${opts.rationale}` : "",
    "",
    "Use `submit_rewrite`.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Library curator + image search ──────────────────────────────────────
export const SEARCH_SYSTEM = `You are EliteVault's Intelligent Search.

Given a user's intent (text prompt OR a screenshot of their own store) you
rank a candidate list of winning ecommerce stores by similarity to their
intent — visually, structurally, and by niche fit.

Always call the \`rank_results\` tool with the ordered ids and a
1-line reasoning per result. Return at most 12 items.`;
