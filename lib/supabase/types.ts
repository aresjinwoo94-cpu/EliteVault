/**
 * Hand-written Database types matching supabase/migrations/0001_init.sql.
 * If you regenerate with `supabase gen types typescript`, paste the output here.
 */

export type PlanTier = "free" | "pro" | "scale";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type AnalysisStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "refunded";

export interface BuyerPersona {
  age?: number | string;
  gender?: "male" | "female" | "any";
  country?: string;
  interests?: string[];
  income_band?: string;
  notes?: string;
}

export interface ConversionScenarios {
  organic: number;          // 0..1
  meta_ads_bad: number;
  meta_ads_regular: number;
  meta_ads_good: number;
}

export interface Annotation {
  type: "arrow" | "circle" | "cross" | "highlight" | "label";
  x: number;        // 0..1 normalized
  y: number;
  width?: number;
  height?: number;
  severity: "low" | "medium" | "high";
  message: string;  // short why
  fix: string;      // actionable suggestion
}

export interface AnalysisResult {
  score: number;                      // 1..100
  scenarios: ConversionScenarios;
  category_scores: {
    color_integration: number;
    layout_proportion: number;
    image_quality: number;
    technical_optimization: number;
    niche_coherence: number;
    cro_principles: number;
  };
  buyer_persona_response: {
    headline: string;       // "I'd bounce in 2 seconds because…"
    quotes: string[];       // 3-5 punchy one-liners
    would_buy: boolean;
    reasons: string[];
  };
  annotations: Annotation[];
  summary: string;
  top_fixes: { title: string; impact: "high" | "medium" | "low"; effort: "S" | "M" | "L" }[];
}

export interface RewriteResult {
  section: string;          // "hero", "product page", ...
  html: string;
  css: string;
  rationale: string;
}

// v2 — Meta Ads + Community + API ──────────────────────────────────────────

/** Estimated activity proxy from the public Meta Ad Library. */
export interface AdSignals {
  active_ads: number;            // approximate # of ads currently running
  days_running_max: number;      // longest single ad lifespan (days)
  region_count: number;          // distinct countries detected
  last_seen: string;             // ISO date of the most recent ad
  activity_score: number;        // 0..100 — our proxy for "this is converting"
  estimated: boolean;            // always true for now — flag for honest UI
}

export interface MetaAdsRecommendation {
  niche: string;
  audience_seed: string;         // 1-2 sentence ICP
  budget_band: { daily_min: number; daily_max: number; currency: "USD" };
  targets: {
    cpc: number;                 // recommended max CPC
    cpm: number;                 // recommended max CPM
    ctr: number;                 // realistic CTR (0..1)
    roas: number;                // breakeven + 30% target
    cvr: number;                 // landing-page conversion rate target
  };
  creatives: {
    angle: string;               // hook angle
    hook: string;                // first-3-seconds copy
    cta: string;                 // button copy
    format: "single-image" | "carousel" | "ugc-video" | "demo-video";
  }[];
  targeting: {
    interests: string[];
    custom_audiences: string[];  // suggestions to build
    exclusions: string[];
  };
  testing_plan: { step: string; budget: number; days: number }[];
  caveats: string[];             // honesty about what this can't predict
}

export interface CommunityAnalysis {
  id: string;
  source_analysis_id: string | null;
  user_id: string;
  slug: string;
  display_name: string | null;
  url: string;
  domain: string;
  score: number;
  niche: string | null;
  summary: string;
  scenarios: ConversionScenarios;
  category_scores: AnalysisResult["category_scores"];
  annotations: Annotation[];
  top_fixes: AnalysisResult["top_fixes"];
  buyer_persona: BuyerPersona | null;
  persona_response: AnalysisResult["buyer_persona_response"] | null;
  ad_signals: AdSignals | null;
  screenshot_url: string | null;
  view_count: number;
  helpful_count: number;
  report_count: number;
  is_removed: boolean;
  is_featured: boolean;
  // v3.7 — leaderboard ranking columns. Computed at publish time
  // (see app/actions/community.ts) and indexed for fast ORDER BY.
  composite_score: number;          // 0..100, includes conversion bonus
  rank_tier: string | null;         // one of the keys in lib/ranking/tiers.ts
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;           // for display only — full token shown once
  last_used_at: string | null;
  request_count: number;
  revoked_at: string | null;
  created_at: string;
}

// v3.0 — Meta Campaign Scenario Modeler ───────────────────────────────────

/** One day in the 7-day projection. */
export interface SimulationDay {
  day: number;                 // 1..7
  spend: number;               // USD
  impressions: number;
  clicks: number;
  ctr: number;                 // 0..1
  cpc: number;
  cpm: number;
  purchases: number;
  revenue: number;
  cpa: number;                 // cost per acquisition
  roas: number;
}

export interface SimulationScenario {
  /** "conservative" | "balanced" | "aggressive" */
  variant: "conservative" | "balanced" | "aggressive";
  /** One-line strategic summary. */
  summary: string;
  /** Win condition for this scenario (e.g. "Hit 1.8x ROAS by day 7"). */
  win_condition: string;
  /** What's likely to go wrong. */
  risks: string[];
  /** 7-day projection. */
  days: SimulationDay[];
  /** Totals over the 7 days. */
  totals: {
    spend: number;
    revenue: number;
    purchases: number;
    roas: number;               // weighted across all days
    cpa: number;
  };
  /** Strategic recommendation: tactical adjustment to consider. */
  recommendation: string;
}

export interface MetaSimulation {
  id: string;
  analysis_id: string;
  user_id: string;
  aov_usd: number;
  daily_budget_usd: number;
  product_margin_pct: number | null;
  notes: string | null;
  conservative: SimulationScenario | null;
  balanced: SimulationScenario | null;
  aggressive: SimulationScenario | null;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  inngest_run_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          stripe_customer_id: string | null;
          plan: PlanTier;
          credits: number;
          onboarded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: SubscriptionStatus;
          price_id: string;
          plan: PlanTier;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          trial_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]> & {
          id: string;
          user_id: string;
          status: SubscriptionStatus;
          price_id: string;
          plan: PlanTier;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
      };
      stripe_events: {
        Row: {
          id: string;
          type: string;
          payload: unknown;
          processed_at: string;
        };
        Insert: {
          id: string;
          type: string;
          payload: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["stripe_events"]["Row"]>;
      };
      analyses: {
        Row: {
          id: string;
          user_id: string;
          status: AnalysisStatus;
          url: string | null;
          screenshot_url: string | null;
          buyer_persona: BuyerPersona | null;
          // JSONB columns — kept as `unknown` here so the Database type
          // doesn't bloat the inferred response types (we cast where needed).
          result: unknown;
          rewrite: unknown;
          meta_ads: unknown;
          is_published: boolean;
          published_at: string | null;
          error: string | null;
          credits_charged: number;
          inngest_run_id: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["analyses"]["Row"]> & {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["analyses"]["Row"]>;
      };
      winning_sites: {
        Row: {
          id: string;
          url: string;
          domain: string;
          title: string;
          description: string | null;
          niche: string;
          thumbnail_url: string;
          metrics: Record<string, unknown>;
          tags: string[];
          embedding: number[] | null;
          added_by_ai: boolean;
          is_featured: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["winning_sites"]["Row"]> & {
          url: string;
          domain: string;
          title: string;
          niche: string;
          thumbnail_url: string;
        };
        Update: Partial<Database["public"]["Tables"]["winning_sites"]["Row"]>;
      };
      search_history: {
        Row: {
          id: string;
          user_id: string;
          kind: "text" | "image";
          query: string | null;
          image_url: string | null;
          result_ids: string[];
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["search_history"]["Row"]> & {
          user_id: string;
          kind: "text" | "image";
        };
        Update: Partial<Database["public"]["Tables"]["search_history"]["Row"]>;
      };
    };
  };
}
