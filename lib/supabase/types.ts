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
          result: AnalysisResult | null;
          rewrite: RewriteResult | null;
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
