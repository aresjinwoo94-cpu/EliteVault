import { PLANS } from "@/lib/stripe/plans";
import { COMPANY } from "@/lib/company";
import { FAQ_ITEMS } from "@/lib/content/faq";

/**
 * Support knowledge base (Phase 5). The ONLY facts the chatbot may answer
 * from. Prices/contact derive from the same single sources (PLANS, COMPANY,
 * FAQ) so they never drift. Keep these entries in sync with the legal pages.
 *
 * The chat route forbids the model from answering anything not grounded here
 * (no inventing prices, dates, or policies — a real legal risk).
 */
export type KbCategory =
  | "billing"
  | "product"
  | "legal"
  | "company"
  | "account";

export type KbEntry = {
  id: string;
  category: KbCategory;
  q: string;
  a: string;
  keywords: string[];
};

const CURATED: KbEntry[] = [
  // ── Billing ──────────────────────────────────────────────────────────────
  {
    id: "pricing",
    category: "billing",
    q: "How much does EliteVault cost?",
    a: `EliteVault has a Free plan, Pro at $${PLANS.pro.price.month}/mo (or $${PLANS.pro.price.year}/yr), and Scale at $${PLANS.scale.price.month}/mo (or $${PLANS.scale.price.year}/yr). Annual billing saves ~20%.`,
    keywords: ["price", "pricing", "cost", "how much", "plan", "plans", "pro", "scale", "annual", "monthly", "$"],
  },
  {
    id: "cancel",
    category: "billing",
    q: "How do I cancel my subscription?",
    a: "You can cancel anytime in two clicks from the Stripe Customer Portal (Billing → Manage subscription). You keep access until the end of the period you've already paid for, then your account moves to the Free plan.",
    keywords: ["cancel", "cancellation", "unsubscribe", "stop", "end subscription", "portal"],
  },
  {
    id: "refund",
    category: "billing",
    q: "Do you offer refunds?",
    a: "EliteVault is a digital service delivered immediately, so payments are non-refundable and all sales are final, including partial or unused periods. When you cancel you are not charged again, but the current period is not refunded. See the Refund & Cancellation Policy at /legal/refunds.",
    keywords: ["refund", "refunds", "money back", "reimburse", "chargeback"],
  },
  {
    id: "payment-failed",
    category: "billing",
    q: "My payment failed — what happens?",
    a: "Stripe retries automatically. You can update your card anytime in Billing → Manage subscription. If payment keeps failing, your subscription may move to past-due; once a payment succeeds, your plan is restored.",
    keywords: ["payment failed", "card declined", "billing failed", "past due", "update card", "payment method"],
  },
  // ── Product ──────────────────────────────────────────────────────────────
  {
    id: "what-is",
    category: "product",
    q: "What is EliteVault?",
    a: "EliteVault is an AI conversion-audit tool for ecommerce. Paste your store URL and get a conversion score, an annotated screenshot, a buyer-persona simulation, and a ranked list of fixes — in under a minute.",
    keywords: ["what is", "about", "do", "product", "audit", "analyzer"],
  },
  {
    id: "score",
    category: "product",
    q: "How does the score work?",
    a: "Your overall score (0–100) is a fast conversion estimate built from six categories: color, layout, imagery, technical, niche fit, and CRO principles. It's a directional estimate, not a guarantee — use the ranked fixes to prioritize the highest-leverage changes.",
    keywords: ["score", "scoring", "rating", "how is the score", "100", "categories"],
  },
  {
    id: "analysis-failed",
    category: "product",
    q: "My analysis failed.",
    a: "Some sites block screenshots, or the AI provider is briefly overloaded. When an audit fails, your credit is automatically refunded and you can retry. If it keeps failing, try uploading a screenshot manually or contact support.",
    keywords: ["failed", "error", "stuck", "not working", "broken analysis", "retry"],
  },
  {
    id: "free",
    category: "product",
    q: "Is there a free plan?",
    a: `Yes. Free includes one audit of your own store (score + annotated screenshot) and the curated library of winning stores. The full Analyzer needs Pro; the scenario modeler and REST API need Scale.`,
    keywords: ["free", "free plan", "free trial", "trial", "no card"],
  },
  // ── Legal / data ───────────────────────────────────────────────────────
  {
    id: "data-training",
    category: "legal",
    q: "Do you train AI on my data?",
    a: "No. Your URLs, screenshots, and audits are private to your account. We process them with Google Gemini to generate your result, but we do not train AI models on your content and do not sell or share your screenshots with third parties. See /legal/privacy.",
    keywords: ["train", "training", "ai", "data", "privacy", "private", "gemini", "share", "sell"],
  },
  {
    id: "policies",
    category: "legal",
    q: "Where are your privacy policy and terms?",
    a: "Privacy Policy: /legal/privacy. Terms of Service: /legal/terms. Refund & Cancellation Policy: /legal/refunds.",
    keywords: ["privacy", "terms", "policy", "policies", "legal", "tos"],
  },
  {
    id: "guarantee",
    category: "legal",
    q: "Do you guarantee results?",
    a: "No. Scores, persona simulations, and Meta Ads projections are AI-generated estimates to guide you, not guarantees of any specific revenue or advertising outcome. You decide what to act on.",
    keywords: ["guarantee", "guaranteed", "promise", "results", "estimate", "accurate"],
  },
  // ── Company ────────────────────────────────────────────────────────────
  {
    id: "company",
    category: "company",
    q: "Who operates EliteVault?",
    a: `EliteVault is operated by ${COMPANY.legalEntity}, based in ${COMPANY.country}. You can reach the team at ${COMPANY.contactEmail}.`,
    keywords: ["who", "company", "owner", "operate", "business", "llc", "founder", "contact", "email"],
  },
  // ── Account ────────────────────────────────────────────────────────────
  {
    id: "signin",
    category: "account",
    q: "How do I sign in?",
    a: "Sign in with a one-tap magic link sent to your email, or with Google. The link can take a few seconds to arrive — check your inbox (and spam).",
    keywords: ["sign in", "login", "log in", "magic link", "google", "password", "access account"],
  },
];

/** Full KB = curated entries + the shared marketing FAQ. */
export const KB: KbEntry[] = [
  ...CURATED,
  ...FAQ_ITEMS.map((f, i) => ({
    id: `faq-${i}`,
    category: "product" as KbCategory,
    q: f.q,
    a: f.a,
    keywords: f.q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  })),
];

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9$]+/)
    .filter((w) => w.length > 2);
}

/**
 * Lightweight keyword retrieval (no embeddings infra). Scores each entry by
 * how many query tokens hit its keywords / question / answer, returns the top
 * matches above a minimum score.
 */
export function retrieve(query: string, max = 4): KbEntry[] {
  const qt = tokens(query);
  if (qt.length === 0) return [];
  const scored = KB.map((entry) => {
    const hay = (
      entry.keywords.join(" ") +
      " " +
      entry.q +
      " " +
      entry.a
    ).toLowerCase();
    let score = 0;
    for (const t of qt) {
      if (entry.keywords.some((k) => k.includes(t) || t.includes(k))) score += 2;
      else if (hay.includes(t)) score += 1;
    }
    return { entry, score };
  });
  return scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.entry);
}
