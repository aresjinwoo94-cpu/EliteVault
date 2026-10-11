import { FixTrackFixSchema, type FixTrackFix } from "@/ai/schemas";
import { themeBySlug } from "@/lib/analyzer/shopify-themes";

/**
 * Fix Tracks — pure rules (docs/store-audit-fix-tracks-premium.md §3).
 * No I/O here on purpose: gating, sanitising and competitor selection are the
 * parts that must never regress, so they are directly unit-testable.
 */

import {
  GENERATED_TRACKS,
  isGeneratedTrack,
  parseTrack,
  TRACKS,
  type GeneratedTrack,
  type Track,
} from "@/lib/analyzer/fix-track-ids";

export { GENERATED_TRACKS, isGeneratedTrack, parseTrack, TRACKS };
export type { GeneratedTrack, Track };

export interface StoredTrack {
  fixes?: FixTrackFix[];
  meta?: Record<string, unknown>;
  generated_at?: string;
  pending_at?: string;
  attempts?: number;
}

/** Max generation attempts per track per analysis (mirrors fix_tracks_claim in 0036). */
export const MAX_TRACK_ATTEMPTS = 3;
export interface FixTracksState {
  free_choice: Track | null;
  tracks: Partial<Record<GeneratedTrack, StoredTrack>>;
}

export function parseState(raw: unknown): FixTracksState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // `urgent` used to be a pickable track that spent the free choice. It no longer is (its fixes ship
  // with the audit and cost no AI), so a legacy row holding it means "nothing spent yet".
  const rawChoice = parseTrack(o.free_choice);
  const choice = rawChoice === "urgent" ? null : rawChoice;
  const tracks: FixTracksState["tracks"] = {};
  for (const t of GENERATED_TRACKS) {
    const v = o[t];
    if (v && typeof v === "object") tracks[t] = v as StoredTrack;
  }
  return { free_choice: choice, tracks };
}

/** anon = pre-login (ev_anon cookie), free = account on the free plan. */
export type Viewer = "anon" | "free" | "paid";

export type Access =
  | { kind: "serve" }
  /** Free/anon with no choice yet: this request IS the choice (atomically recorded). */
  | { kind: "choose" }
  | { kind: "locked"; choice: Track };

/**
 * Server-side gate (§3.4). Paid opens everything. Free/anon ALWAYS see `urgent` (its fixes are already in the
 * audit: no AI, nothing to spend) and get exactly ONE of the three generated tracks, forever.
 */
export function decideAccess(viewer: Viewer, track: Track, state: FixTracksState): Access {
  if (viewer === "paid" || track === "urgent") return { kind: "serve" };
  if (!state.free_choice) return { kind: "choose" };
  return state.free_choice === track ? { kind: "serve" } : { kind: "locked", choice: state.free_choice };
}

// ── sanitising ────────────────────────────────────────────────────────────

const GENERIC = [
  "improve your cro",
  "optimize your store",
  "optimise your store",
  "best practice",
  "increase conversions",
  "boost sales",
  "take it to the next level",
  "mejora tu cro",
  "optimiza tu tienda",
  "mejores prácticas",
  "aumenta tus conversiones",
  "aumenta tus ventas",
];
/** "estimates, not guarantees": no invented % or $ figures in any track. */
const NUMERIC_CLAIM = /\d\s?%|%\s?\d|[$€£]\s?\d|\d\s?(usd|eur)\b/i;
const STOP = new Set(["your", "store", "this", "that", "with", "from", "have", "they", "them", "tienda", "para", "esta", "este", "como"]);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9áéíóúñ]{4,}/g) ?? []).filter((t) => !STOP.has(t));
}

export function looksSpecific(evidence: string, haystack: string): boolean {
  const e = evidence.toLowerCase();
  if (GENERIC.some((g) => e.includes(g))) return false;
  const known = new Set(tokens(haystack));
  return tokens(e).some((t) => known.has(t));
}

/**
 * Keeps only fixes that (a) validate, (b) carry specific `evidence` of THIS
 * store, (c) contain no invented % / $, (d) for theme_colors, name a theme from
 * the closed list when they name one at all. Anything else is DROPPED (never
 * repaired or invented). Returns at most 3.
 */
export function sanitizeFixes(raw: unknown, ctx: { track: GeneratedTrack; haystack: string }): FixTrackFix[] {
  if (!Array.isArray(raw)) return [];
  const out: FixTrackFix[] = [];
  for (const item of raw) {
    const parsed = FixTrackFixSchema.safeParse(item);
    if (!parsed.success) continue;
    const fix = { ...parsed.data };
    const text = `${fix.title} ${fix.why ?? ""} ${fix.evidence}`;
    if (NUMERIC_CLAIM.test(text)) continue;
    if (GENERIC.some((g) => text.toLowerCase().includes(g))) continue;
    if (!looksSpecific(fix.evidence, ctx.haystack)) continue;
    if (ctx.track === "theme_colors") {
      if (fix.theme_slug !== undefined) {
        const theme = themeBySlug(fix.theme_slug);
        if (!theme) continue;
        fix.theme_slug = theme.slug;
      }
    } else {
      delete fix.theme_slug;
    }
    out.push(fix);
    if (out.length === 3) break;
  }
  return out;
}

export type GatedFix = Partial<FixTrackFix> & { title: string; locked?: boolean };

/**
 * Free/anon see fix #1 in full; #2+ keep only the title/impact/effort. The text
 * is removed HERE (server), not blurred in the client.
 */
export function gateFixes(fixes: FixTrackFix[], viewer: Viewer): GatedFix[] {
  return fixes.map((f, i) =>
    viewer === "paid" || i === 0
      ? f
      : { title: f.title, impact: f.impact, effort: f.effort, locked: true },
  );
}

// ── competitor selection ──────────────────────────────────────────────────

export interface StoredWinner {
  title: string;
  domain: string;
  url: string;
  faviconUrl?: string;
  exactMatch: boolean;
  activeAds: number | null;
  revenue: { low: number; high: number } | null;
}

/** Reads analyses.niche_winners; a "global" (non-niche) list is NOT a competitor list. */
export function parseNicheWinners(stored: unknown): StoredWinner[] {
  if (!stored || typeof stored !== "object") return [];
  const s = stored as { scope?: unknown; winners?: unknown };
  if (s.scope === "global" || !Array.isArray(s.winners)) return [];
  return s.winners.flatMap((w): StoredWinner[] => {
    if (!w || typeof w !== "object") return [];
    const o = w as Record<string, unknown>;
    if (typeof o.domain !== "string" || !o.domain) return [];
    const rev = o.revenue as { low?: unknown; high?: unknown } | null | undefined;
    return [
      {
        title: typeof o.title === "string" ? o.title : o.domain,
        domain: o.domain,
        url: typeof o.url === "string" ? o.url : `https://${o.domain}`,
        faviconUrl: typeof o.faviconUrl === "string" ? o.faviconUrl : undefined,
        exactMatch: o.exactMatch === true,
        activeAds: typeof o.activeAds === "number" ? o.activeAds : null,
        revenue:
          rev && typeof rev.low === "number" && typeof rev.high === "number"
            ? { low: rev.low, high: rev.high }
            : null,
      },
    ];
  });
}

/**
 * Same-niche winner WITH a teardown, tie-broken by estimated revenue then active
 * ads. Returns null when there is none — the caller shows the honest empty state
 * and spends NO AI call. Never falls back to an other-niche store.
 */
export function pickCompetitor<T>(
  winners: StoredWinner[],
  teardowns: Map<string, T>,
): { winner: StoredWinner; teardown: T } | null {
  const eligible = winners
    .filter((w) => w.exactMatch && teardowns.has(w.domain))
    .sort(
      (a, b) =>
        (b.revenue?.high ?? 0) - (a.revenue?.high ?? 0) || (b.activeAds ?? 0) - (a.activeAds ?? 0),
    );
  const winner = eligible[0];
  return winner ? { winner, teardown: teardowns.get(winner.domain)! } : null;
}
