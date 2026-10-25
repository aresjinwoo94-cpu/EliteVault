/**
 * Shared FAQ content — single source reused by the marketing FAQ section,
 * the Support/Help center, and (Phase 5) the support chatbot knowledge base,
 * so the answers never drift apart.
 */
export type FaqItem = { q: string; a: string };

import { reportUnlockEnabled } from "@/lib/flags";

const BASE_FAQ_ITEMS: FaqItem[] = [
  {
    q: "How is this different from a heatmap or session-replay tool?",
    a: "Hotjar and Clarity show what users do — EliteVault explains why. We don't need traffic to give you an audit. Our AI reads design fundamentals (color, hierarchy, copy, CRO heuristics) and benchmarks them against stores actually scaling on paid social today.",
  },
  {
    q: "Where do the 'winning sites' in the Library come from?",
    a: "An AI assistant proposes candidate stores in each niche, and every one is checked automatically (site live, complete listing, niche fit) before it enters the Library. The Library is re-checked periodically, and stores that go offline are removed. Ad-activity figures are labelled as estimates unless they come from a recent Meta Ad Library measurement.",
  },
  {
    q: "Is the Analyzer accurate on small or new stores?",
    a: "Yes — accuracy comes from design-fundamentals scoring, not traffic data. We grade what's visible on the page. A pre-launch store can get a meaningful audit before it ever runs an ad.",
  },
  {
    q: "Can I cancel anytime?",
    a: "One click in the Stripe Customer Portal. No retention emails, no calls.",
  },
  {
    // Keep in sync with /legal/privacy §5, faqContent.q4/a4 in lib/i18n/dict/ui-{en,es}.json,
    // lib/support/kb.ts ("data-training"), supportPage.privacyBody and app/llms.txt.
    // If Gemini moves to the PAID tier, change two things: drop "We currently use Gemini's
    // free tier... confidential or personal information." and say Google does not use
    // paid-tier content to improve its products.
    q: "What happens to my screenshots and data?",
    a: "We never train models on your data and we never sell it. To run an audit, your page URL and screenshot are processed by our AI provider, Google Gemini. We currently use Gemini's free tier, where Google may use submitted content to improve its services, so avoid auditing pages with confidential or personal information. Audits are private to your account unless you create a share link. Details in our Privacy Policy (/legal/privacy).",
  },
];

/**
 * Build a schema.org FAQPage object from the shared FAQ items. Use on any
 * page that actually RENDERS these questions (Google requires the FAQ content
 * to be visible on the page carrying the markup). Reused by /pricing and
 * /support so their structured data never drifts from what's on screen.
 */
export function faqPageJsonLd(items: FaqItem[] = FAQ_ITEMS) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

/** The one-time unlock is listed only while it is on sale (REPORT_UNLOCK) and never in the plan table. */
const UNLOCK_FAQ: FaqItem = {
  q: "Can I pay for just one report?",
  a: "Yes. On the Free plan you can unlock the full report of a single audit for a one-time US$7: every fix with its how-to, the buyer-persona simulation, all the fix tracks, one Meta campaign projection for that audit and the winning stores in your niche. No subscription and no card on file. It covers that audit only; new audits, publishing, the Optimizer and the full Library stay with Pro and Scale. If you change your mind, email us within 7 days and we refund it — the report then locks again.",
};

export const FAQ_ITEMS: FaqItem[] = reportUnlockEnabled() ? [...BASE_FAQ_ITEMS, UNLOCK_FAQ] : BASE_FAQ_ITEMS;
