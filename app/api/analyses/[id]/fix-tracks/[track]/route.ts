import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAnonToken } from "@/lib/anon/session";
import { getLocale } from "@/lib/i18n/server";
import { analyzerFixTracksEnabled } from "@/lib/flags";
import type { AnalysisResult } from "@/lib/supabase/types";
import { resolveCompetitor } from "@/lib/analyzer/fix-tracks-data";
import { runFixTrack, type CompetitorContext } from "@/ai/agents/fix-track-agent";
import {
  decideAccess,
  gateFixes,
  isGeneratedTrack,
  MAX_TRACK_ATTEMPTS,
  parseState,
  parseTrack,
  type Viewer,
} from "@/lib/analyzer/fix-tracks";

/**
 * On-demand Fix Track for one analysis (docs/store-audit-fix-tracks-premium.md §3.2).
 *
 * Modeled on app/api/analyses/[id]/growth-map: ownership check, cache in a jsonb
 * column of `analyses`, gating on the SERVER, honest failure (nothing generic is
 * ever cached). Never touches the analyzer pipeline.
 *
 * Cost rules, enforced here and by the atomic SQL functions in migration 0036:
 *   • urgent               → 0 AI calls (top_fixes already ship with the audit).
 *   • cached track         → 0 AI calls.
 *   • competitor, no same-niche winner with a teardown → 0 AI calls (honest empty).
 *   • otherwise            → exactly 1 AI call, claimed atomically (double click /
 *                            two tabs cannot generate twice).
 *   • free/anon            → ONE track per analysis, ever (free_choice); a request
 *                            for any other track is refused before any work.
 */

export const maxDuration = 30;
const GEN_TIMEOUT_MS = 20_000;

const NO_STORE = { "Cache-Control": "no-store" };

function isUndefinedColumn(err: { code?: string; message?: string } | null) {
  return (
    !!err &&
    (err.code === "42703" ||
      /column .* does not exist|could not find the .* column/i.test(err.message ?? ""))
  );
}

interface Row {
  id: string;
  status: string;
  url: string | null;
  user_id: string | null;
  anon_id: string | null;
  result: unknown;
  niche_winners: unknown;
  fix_tracks: unknown;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; track: string }> },
) {
  if (!analyzerFixTracksEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const { id, track: rawTrack } = await params;
  const track = parseTrack(rawTrack);
  if (!track) {
    return NextResponse.json({ error: "invalid_track" }, { status: 400, headers: NO_STORE });
  }

  // ── who is asking ──────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const anonToken = user ? null : await getAnonToken();
  if (!user && !anonToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  // Service client for the read so we can tell "doesn't exist" (404) from "not
  // yours" (403); the ownership check below is the actual boundary.
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("analyses")
    .select("id, status, url, user_id, anon_id, result, niche_winners, fix_tracks")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isUndefinedColumn(error)) {
      // Migration 0036 not applied yet: fail closed, the report is unaffected.
      return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const row = data as unknown as Row | null;
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const owns = user
    ? row.user_id === user.id
    : !row.user_id && !!row.anon_id && row.anon_id === anonToken;
  if (!owns) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });

  if (row.status !== "succeeded" || !row.result) {
    return NextResponse.json({ error: "not_ready" }, { status: 409, headers: NO_STORE });
  }
  const result = row.result as AnalysisResult;
  if (result.capture_blocked?.detected) {
    return NextResponse.json({ error: "capture_blocked" }, { status: 409, headers: NO_STORE });
  }

  let viewer: Viewer = "anon";
  if (user) {
    const { data: prof } = await service.from("profiles").select("plan").eq("id", user.id).maybeSingle();
    viewer = ((prof as unknown as { plan?: string } | null)?.plan ?? "free") === "free" ? "free" : "paid";
  }

  // ── gate (server-side, before any work) ────────────────────────────────
  let state = parseState(row.fix_tracks);
  const access = decideAccess(viewer, track, state);
  if (access.kind === "locked") {
    return NextResponse.json(
      { error: "locked", choice: access.choice, viewer },
      { status: 403, headers: NO_STORE },
    );
  }
  let competitor: CompetitorContext | null = null;
  let competitorMeta: Record<string, unknown> | null = null;
  // ── competitor: pick the same-niche winner with a teardown (no AI yet) ──
  // Resolved BEFORE the free choice is recorded: an empty/failed lookup must not consume it.
  if (track === "competitor" && !state.tracks.competitor?.fixes?.length) {
    const res = await resolveCompetitor(row.niche_winners);
    if (!res.ok && res.reason === "error") {
      // A DB blip must not look like "no competitor" (and must not burn the free choice).
      return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
    }
    if (!res.ok) {
      return NextResponse.json(
        { track, viewer, choice: viewer === "paid" ? null : state.free_choice, empty: "no_competitor", fixes: [] },
        { headers: NO_STORE },
      );
    }
    const pick = res;
    competitor = { title: pick.winner.title, domain: pick.winner.domain, teardown: pick.teardown };
    competitorMeta = {
      title: pick.winner.title,
      domain: pick.winner.domain,
      url: pick.winner.url,
      faviconUrl: pick.winner.faviconUrl ?? null,
    };
  }

  if (access.kind === "choose") {
    const { data: won, error: rpcErr } = await service.rpc("fix_tracks_choose", {
      p_id: id,
      p_track: track,
    } as never);
    if (rpcErr) {
      return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
    }
    if (won !== track) {
      // Lost a race with another tab that picked a different track.
      return NextResponse.json(
        { error: "locked", choice: parseTrack(won), viewer },
        { status: 403, headers: NO_STORE },
      );
    }
    state = { ...state, free_choice: track };
  }

  const choice = viewer === "paid" ? null : state.free_choice;

  // urgent: nothing to generate — the choice itself is the whole effect.
  if (!isGeneratedTrack(track)) {
    return NextResponse.json({ track, viewer, choice, fixes: null }, { headers: NO_STORE });
  }

  // ── cache ──────────────────────────────────────────────────────────────
  const stored = state.tracks[track];
  if (stored?.fixes?.length) {
    return NextResponse.json(
      {
        track,
        viewer,
        choice,
        cached: true,
        fixes: gateFixes(stored.fixes, viewer),
        meta: stored.meta ?? null,
      },
      { headers: NO_STORE },
    );
  }

  // Hard cap: after MAX_TRACK_ATTEMPTS failed generations stop spending AI on this track.
  if (!stored?.fixes?.length && (stored?.attempts ?? 0) >= MAX_TRACK_ATTEMPTS) {
    return NextResponse.json(
      { error: "attempts_exhausted", track, viewer, choice },
      { status: 429, headers: NO_STORE },
    );
  }

  // ── claim + generate (exactly one AI call) ─────────────────────────────
  const { data: claimed, error: claimErr } = await service.rpc("fix_tracks_claim", {
    p_id: id,
    p_track: track,
  } as never);
  if (claimErr) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  if (!claimed) {
    // Someone else is generating this track right now (or it failed < 30 s ago).
    return NextResponse.json(
      { track, viewer, choice, pending: true },
      { status: 202, headers: { ...NO_STORE, "Retry-After": "5" } },
    );
  }

  const locale = await getLocale();
  const nw = row.niche_winners as { nicheLabel?: unknown } | null;
  const out = await runFixTrack({
    track,
    result,
    domain: row.url ? safeHost(row.url) : null,
    nicheLabel: typeof nw?.nicheLabel === "string" ? nw.nicheLabel : null,
    locale: locale === "es" ? "es" : "en",
    competitor,
    deadlineAt: Date.now() + GEN_TIMEOUT_MS,
  });

  if (!out) {
    // The claim is left in place on purpose: it expires after 30 s, which is the
    // retry cool-down (a failing provider can't be hammered into N AI calls).
    return NextResponse.json(
      { error: "generation_failed", track, viewer, choice },
      { status: 502, headers: NO_STORE },
    );
  }

  const meta: Record<string, unknown> = {
    locale: locale === "es" ? "es" : "en",
    ...(competitorMeta ? { competitor: competitorMeta } : {}),
  };
  await service.rpc("fix_tracks_store", {
    p_id: id,
    p_track: track,
    p_value: { fixes: out.fixes, meta, generated_at: new Date().toISOString() },
  } as never);

  return NextResponse.json(
    { track, viewer, choice, cached: false, fixes: gateFixes(out.fixes, viewer), meta },
    { headers: NO_STORE },
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
