"use server";

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { runSearchAgent } from "@/ai/agents/search-agent";
import { detectImageNiche, type NicheDetection } from "@/ai/agents/image-niche-detector";
import { imageHash } from "@/lib/image-hash";
import { PLANS } from "@/lib/stripe/plans";

export interface WinningSiteCard {
  id: string;
  url: string;
  domain: string;
  title: string;
  niche: string;
  thumbnail_url: string;
  metrics: Record<string, unknown>;
  description?: string | null;
  is_featured: boolean;
  is_preselected?: boolean;
  ad_signals?: Record<string, unknown> | null;
  ai_reason?: string;
  metrics_locked?: boolean;
}

/**
 * In-memory niche detection cache. Same image uploaded twice in 24h
 * skips the Gemini detection call. Lives on the server process — fine
 * for dev. In production swap for Redis / Upstash if multi-instance.
 */
const nicheCache = new Map<string, { detection: NicheDetection; expiresAt: number }>();
const NICHE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function detectCached(opts: {
  screenshotBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
}): Promise<NicheDetection | null> {
  const key = imageHash(opts.screenshotBase64);
  const hit = nicheCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    console.log("[search] niche cache HIT", key.slice(0, 8), "→", hit.detection.niche);
    return hit.detection;
  }
  try {
    const detection = await detectImageNiche(opts);
    nicheCache.set(key, { detection, expiresAt: Date.now() + NICHE_CACHE_TTL_MS });
    console.log("[search] niche detected", detection.niche, `(${(detection.confidence * 100).toFixed(0)}%)`);
    return detection;
  } catch (err) {
    console.warn("[search] niche detection failed:", (err as Error).message);
    return null;
  }
}

/**
 * Library search.
 *
 * Free: only `is_preselected=true` get full metrics. Others appear blurred.
 * Pro/Scale: full unlimited access + AI re-ranking + 2-stage image search.
 *
 * Image search flow (Pro+):
 *   1. detectImageNiche(image)  →  niche + keywords          [cached 24h]
 *   2. SQL filter `winning_sites` to that niche             [free, fast]
 *   3. runSearchAgent on 6-12 candidates                     [1 AI call]
 *
 * vs. naive (re-rank everything), this saves ~80% of Gemini calls.
 */
export async function searchLibrary(opts: {
  prompt?: string;
  niche?: string;
  screenshotBase64?: string;
  mediaType?: "image/png" | "image/jpeg" | "image/webp";
  limit?: number;
}): Promise<{
  items: WinningSiteCard[];
  free: boolean;
  ai: boolean;
  /** Niche the AI detected from the uploaded image (only when image search). */
  detectedNiche?: string | null;
  detectedKeywords?: string[];
}> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let plan: "free" | "pro" | "scale" = "free";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    plan = profile?.plan ?? "free";
  }
  const isPaid = plan !== "free";

  // ── Stage 1: image niche detection (Pro+ only, no card needed) ────
  let detectedNiche: string | null = null;
  let detectedKeywords: string[] = [];
  if (opts.screenshotBase64 && opts.mediaType && isPaid) {
    const detection = await detectCached({
      screenshotBase64: opts.screenshotBase64,
      mediaType: opts.mediaType,
    });
    if (detection) {
      detectedNiche = detection.niche;
      detectedKeywords = detection.keywords;
    }
  }

  // Compose effective niche filter: explicit > detected
  const effectiveNiche = opts.niche ?? detectedNiche ?? null;

  // ── Stage 2: SQL prefilter ────────────────────────────────────────
  let q = supabase
    .from("winning_sites")
    .select(
      "id, url, domain, title, niche, thumbnail_url, metrics, description, is_featured, is_preselected, ad_signals",
    )
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 36);

  if (effectiveNiche) q = q.eq("niche", effectiveNiche);
  if (opts.prompt) {
    const search = opts.prompt.replace(/[^a-z0-9 ]/gi, "").trim();
    if (search) {
      q = q.or(
        `title.ilike.%${search}%,description.ilike.%${search}%,niche.ilike.%${search}%,tags.cs.{${search}}`,
      );
    }
  }

  const { data: rows, error } = await q;
  if (error || !rows) {
    return { items: [], free: !isPaid, ai: false, detectedNiche, detectedKeywords };
  }

  // ── Stage 3: AI re-rank (Pro+ only, on the pre-filtered set) ──────
  const needsAI = Boolean(
    isPaid &&
      ((opts.prompt && opts.prompt.length > 6) || opts.screenshotBase64) &&
      rows.length > 2,
  );

  let items = rows as WinningSiteCard[];
  let ai = false;
  if (needsAI) {
    try {
      const ranked = await runSearchAgent({
        candidates: rows.slice(0, 12).map((r) => ({
          id: r.id,
          title: r.title,
          niche: r.niche,
          description: r.description ?? "",
          url: r.url,
        })),
        prompt:
          opts.prompt ??
          (detectedKeywords.length > 0
            ? `Visual aesthetic: ${detectedKeywords.join(", ")}`
            : undefined),
        screenshotBase64: opts.screenshotBase64,
        mediaType: opts.mediaType,
      });
      const order = new Map(ranked.map((r, i) => [r.id, i]));
      const reasons = new Map(ranked.map((r) => [r.id, r.reason]));
      items = [...rows]
        .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
        .map((r) => ({ ...r, ai_reason: reasons.get(r.id) }));
      ai = true;
    } catch (err) {
      console.warn("[search] AI re-rank failed:", (err as Error).message);
    }
  }

  // ── v2.3: lock metrics for Free users on non-preselected sites ────
  const cap = PLANS[plan].libraryFullMetricsCap;
  items = items.map((it) => ({
    ...it,
    metrics_locked: cap !== null && !it.is_preselected,
  }));

  return {
    items,
    free: !isPaid,
    ai,
    detectedNiche,
    detectedKeywords,
  };
}

export async function getNiches(): Promise<string[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("winning_sites")
    .select("niche")
    .order("niche");
  if (!data) return [];
  return Array.from(new Set(data.map((d) => d.niche)));
}

/** For the "All / Saved" tab counts in the library view. */
export async function getLibraryStats() {
  const service = createSupabaseServiceClient();
  const [{ count: total }, { data: byNiche }] = await Promise.all([
    service.from("winning_sites").select("*", { count: "exact", head: true }),
    service.from("winning_sites").select("niche"),
  ]);
  const niches: Record<string, number> = {};
  for (const r of byNiche ?? []) {
    niches[r.niche] = (niches[r.niche] ?? 0) + 1;
  }
  return { total: total ?? 0, niches };
}
