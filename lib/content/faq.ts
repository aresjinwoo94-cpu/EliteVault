/**
 * Shared FAQ content — single source reused by the marketing FAQ section,
 * the Support/Help center, and (Phase 5) the support chatbot knowledge base,
 * so the answers never drift apart.
 */
export type FaqItem = { q: string; a: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "How is this different from a heatmap or session-replay tool?",
    a: "Hotjar and Clarity show what users do — EliteVault explains why. We don't need traffic to give you an audit. Our AI reads design fundamentals (color, hierarchy, copy, CRO heuristics) and benchmarks them against stores actually scaling on paid social today.",
  },
  {
    q: "Where do the 'winning sites' in the Library come from?",
    a: "An agent continuously monitors paid social cohorts, Shopify trend signals, and growth communities. Every site is re-validated by the AI for traffic/engagement signals before it enters the Library. Stores that stop performing drop out automatically.",
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
    q: "Do my analyses train your AI?",
    a: "No. Your URLs, screenshots and audits are private to your account. We don't train models on customer data, and we don't share screenshots with third parties.",
  },
];
