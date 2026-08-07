import "server-only";
import { resolveNiche, getNicheWinners } from "@/lib/library/niche-winners";
import { analyzerGroundingEnabled } from "@/lib/flags";

/**
 * Analyzer niche grounding (brief §2.3).
 *
 * Feeds the scoring pass a few precomputed `winning_sites` rows as SOFT PRIORS.
 * This is a Supabase read (service client), NOT a third-party/model call, so it
 * respects the zero-third-party-call rule on the request path (brief §0.2). It
 * is nonetheless flag-gated (default OFF) and wrapped in a hard timeout with an
 * empty fallback, so it can NEVER slow or break an audit.
 *
 * Honesty (brief §2.3): only `active_ads_count` is REAL (Meta Ad Library). The
 * curated conv/traffic/roi and modeled revenue are editorial estimates. The
 * priors therefore anchor on `activeAds` + niche demand and are always presented
 * to the model as `ai_estimate`, never as measured fact.
 */

/** One winning-store prior. */
export interface GroundingPrior {
  brand: string;
  /** REAL — Meta Ad Library active-ad count (tag: real_signal). Null if unknown. */
  activeAds: number | null;
  /** Modeled monthly revenue band (USD) — tag: ai_estimate. Null if unknown. */
  estRevenue: { low: number; high: number } | null;
}

/** The grounding context handed to the prompt builder. */
export interface GroundingContext {
  nicheLabel: string;
  /** Sum of active ads across the priors — a soft, real-signal demand proxy. */
  demandProxy: number;
  priors: GroundingPrior[];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("grounding timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Fetch soft priors for the analyzed store's niche. Returns null when the flag
 * is off, the niche can't be resolved, the Library has nothing, or anything at
 * all goes wrong / times out — every one of those is a graceful no-op that
 * leaves the audit exactly as it was.
 */
export async function fetchNicheGroundingPriors(input: {
  url: string | null;
  /** Title/description hint for niche resolution when the URL is opaque. */
  hint?: string | null;
  timeoutMs?: number;
}): Promise<GroundingContext | null> {
  if (!analyzerGroundingEnabled()) return null;

  const niche = resolveNiche({ url: input.url, summary: input.hint ?? null });
  if (!niche) return null;

  const timeoutMs = input.timeoutMs ?? 1500;
  try {
    const result = await withTimeout(
      getNicheWinners(niche, { seed: input.url ?? niche }),
      timeoutMs,
    );
    if (!result || result.winners.length === 0) return null;

    const priors: GroundingPrior[] = result.winners.slice(0, 3).map((w) => ({
      brand: w.title,
      activeAds: w.activeAds,
      estRevenue: w.revenue,
    }));
    const demandProxy = priors.reduce((sum, p) => sum + (p.activeAds ?? 0), 0);
    return { nicheLabel: result.nicheLabel, demandProxy, priors };
  } catch {
    // Timeout / DB error / missing env — never touch the audit.
    return null;
  }
}

/**
 * Render the priors as an honest prompt block. Exported (pure) so it's unit
 * testable and so the labeling contract is verifiable: active ads are the only
 * real signal; everything else reads as an estimate.
 */
export function renderGroundingBlock(ctx: GroundingContext): string {
  const lines = ctx.priors.map((p) => {
    const ads =
      p.activeAds != null
        ? `${p.activeAds} active Meta ads [real_signal]`
        : "active ads unknown";
    const rev =
      p.estRevenue != null
        ? `~$${p.estRevenue.low}-${p.estRevenue.high}/mo modeled revenue [ai_estimate]`
        : "revenue estimate unavailable";
    return `- ${p.brand}: ${ads}; ${rev}`;
  });
  return [
    `# Niche grounding — SOFT PRIORS for "${ctx.nicheLabel}" (context only, not evidence)`,
    "These are comparable winning stores from EliteVault's Library. Use them ONLY",
    "to sanity-check niche demand and what a strong store in this space looks like.",
    "ANCHOR on the [real_signal] active-ad counts + overall niche demand; treat",
    "everything tagged [ai_estimate] as a soft prior, never as measured fact, and",
    "NEVER copy these numbers into your output as if they were this store's.",
    `Niche demand proxy (sum of real active ads): ${ctx.demandProxy}.`,
    ...lines,
  ].join("\n");
}
