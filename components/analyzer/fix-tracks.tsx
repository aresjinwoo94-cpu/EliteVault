"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Lock } from "lucide-react";
import { TopFixes } from "@/components/analyzer/top-fixes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";
import { fill } from "@/lib/i18n/lookup";
import { phCapture } from "@/lib/analytics/posthog";
import { TRACKS, parseTrack, type Track } from "@/lib/analyzer/fix-track-ids";

/**
 * "Fix Tracks" (docs/store-audit-fix-tracks-premium.md §3.5): instead of one
 * fixed list, the report offers four buttons and the viewer picks which kind of
 * fixes to see. Wraps TopFixes (rows, lock, blur and upsell are ITS rendering).
 *
 * Every rule that matters is enforced by the route, not here — this component
 * only reflects it: free/anonymous get ONE track per audit (the route records
 * the choice atomically and answers 403 for any other), so a "locked" tab never
 * fires a request. Paid plans open all four.
 *
 * The active tab lives in the URL (?fixes=post_purchase) so it survives a
 * reload and can be shared; never in localStorage.
 */

interface Fix {
  title: string;
  impact: "high" | "medium" | "low";
  effort: "S" | "M" | "L";
  why?: string | null;
  evidence?: string | null;
  theme_slug?: string | null;
  locked?: boolean;
}

interface TrackPayload {
  fixes: Fix[] | null;
  empty?: string;
  meta?: { competitor?: { title: string; domain: string; url: string; faviconUrl: string | null } } | null;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; exhausted?: boolean }
  | { kind: "unavailable" };

const TAB_KEY: Record<Track, string> = {
  urgent: "fixTracks.tabUrgent",
  post_purchase: "fixTracks.tabPost",
  theme_colors: "fixTracks.tabTheme",
  competitor: "fixTracks.tabCompetitor",
};

const SIGNUP_HREF = "/sign-up?next=/app/analyzer";
const PRO_HREF = "/app/checkout?plan=pro&interval=month";
const MAX_POLLS = 6;

function readUrlTrack(): Track | null {
  try {
    return parseTrack(new URLSearchParams(window.location.search).get("fixes"));
  } catch {
    return null;
  }
}

export function FixTracks({
  analysisId,
  urgentFixes,
  isPaid,
  isAnon,
  initialChoice,
  competitorAvailable,
}: {
  analysisId: string;
  urgentFixes: Fix[];
  isPaid: boolean;
  isAnon: boolean;
  initialChoice: Track | null;
  /** False ⇒ the niche has no same-niche winner with a teardown: button disabled, not selectable. */
  competitorAvailable: boolean;
}) {
  const { t } = useT();
  const plan = isPaid ? "paid" : isAnon ? "anon" : "free";

  const [choice, setChoice] = useState<Track | null>(isPaid ? null : initialChoice);
  // Paid land on "urgent" (already in the audit, nothing to fetch); free/anon on
  // their pick, or on nothing until they choose.
  const [active, setActive] = useState<Track | null>(isPaid ? "urgent" : initialChoice);
  const [confirming, setConfirming] = useState<Track | null>(null);
  const [data, setData] = useState<Partial<Record<Track, TrackPayload>>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [locked, setLocked] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const writeUrl = useCallback((track: Track | null) => {
    try {
      const url = new URL(window.location.href);
      if (track) url.searchParams.set("fixes", track);
      else url.searchParams.delete("fixes");
      window.history.replaceState(null, "", url);
    } catch {
      /* non-critical */
    }
  }, []);

  const load = useCallback(
    async (track: Track, poll = 0) => {
      const seq = ++reqSeq.current;
      setStatus({ kind: "loading" });
      setLocked(false);
      try {
        const res = await fetch(`/api/analyses/${analysisId}/fix-tracks/${track}`, { cache: "no-store" });
        if (seq !== reqSeq.current || !mounted.current) return;
        const body = (await res.json().catch(() => ({}))) as Record<string, any>;
        if (res.status === 200) {
          setData((d) => ({ ...d, [track]: { fixes: body.fixes ?? null, empty: body.empty, meta: body.meta ?? null } }));
          if (!isPaid && body.choice) setChoice(body.choice as Track);
          setStatus({ kind: "idle" });
          if (body.empty !== "no_competitor") {
            phCapture("fix_track_selected", { track, plan, cached: body.cached === true });
          }
          return;
        }
        if (res.status === 202 && poll < MAX_POLLS) {
          pollTimer.current = setTimeout(() => void load(track, poll + 1), 5000);
          return;
        }
        if (res.status === 403 && body.error === "locked") {
          if (body.choice) setChoice(body.choice as Track);
          setLocked(true);
          setStatus({ kind: "idle" });
          return;
        }
        if (res.status === 503) return setStatus({ kind: "unavailable" });
        if (res.status === 429) return setStatus({ kind: "error", exhausted: true });
        setStatus({ kind: "error" });
      } catch {
        if (seq === reqSeq.current) setStatus({ kind: "error" });
      }
    },
    [analysisId, isPaid, plan],
  );

  // Deep link (?fixes=…) — paid open the tab; free/anon only the one they own.
  useEffect(() => {
    const fromUrlRaw = readUrlTrack();
    const fromUrl = fromUrlRaw === "competitor" && !competitorAvailable ? null : fromUrlRaw;
    if (!fromUrl) {
      if (active && active !== "urgent" && !data[active]) void load(active);
      return;
    }
    if (isPaid || !choice || fromUrl === choice) {
      if (isPaid || choice) {
        setActive(fromUrl);
        if (fromUrl !== "urgent" && !data[fromUrl]) void load(fromUrl);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (track: Track) => {
    if (track === "competitor" && !competitorAvailable) return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    reqSeq.current++;
    setActive(track);
    setStatus({ kind: "idle" });
    setLocked(false);
    if (isPaid || !choice || choice === track) writeUrl(track);
    if (isPaid) {
      setConfirming(null);
      if (track === "urgent") phCapture("fix_track_selected", { track, plan, cached: true });
      else if (!data[track]) void load(track);
      return;
    }
    if (choice && track !== choice) {
      setConfirming(null);
      setLocked(true); // no request: the route would refuse it
      return;
    }
    if (choice === track) {
      setConfirming(null);
      if (!data[track]) void load(track);
      return;
    }
    setConfirming(track); // nothing chosen yet → light confirmation first
  };

  const confirm = () => {
    if (!confirming) return;
    const track = confirming;
    setConfirming(null);
    void load(track);
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    // Arrows only MOVE focus; Enter/Space (the button's click) activates. Activating on
    // arrow would let a paid user arrow across the row and fire up to 3 AI generations.
    const next = TRACKS[(i + (e.key === "ArrowRight" ? 1 : TRACKS.length - 1)) % TRACKS.length];
    document.getElementById(`fix-tab-${next}`)?.focus();
  };

  const tabs = (
    <div
      role="tablist"
      aria-label={t("fixTracks.aria")}
      className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
    >
      {TRACKS.map((track, i) => {
        const selected = active === track;
        const lockedTab = !isPaid && !!choice && choice !== track;
        const soon = track === "competitor" && !competitorAvailable;
        return (
          <button
            key={track}
            id={`fix-tab-${track}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-disabled={soon || undefined}
            title={soon ? t("fixTracks.comingSoon") : undefined}
            tabIndex={(active ? selected : i === 0) ? 0 : -1}
            onClick={() => select(track)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors min-h-[44px]",
              soon
                ? "cursor-not-allowed border-white/[0.05] bg-white/[0.01] text-white/30"
                : selected
                ? "border-signal-500/50 bg-signal-600/15 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/20 hover:text-white",
            )}
          >
            {lockedTab && <Lock className="size-3 text-white/40" />}
            {t(TAB_KEY[track])}
            {soon && <span className="text-[10px] font-normal text-white/40">· {t("fixTracks.comingSoon")}</span>}
          </button>
        );
      })}
    </div>
  );

  const current = active ? data[active] : undefined;
  const urgentShown = active === "urgent" && (isPaid || choice === "urgent" || status.kind === "unavailable");
  const generatedFixes = active && active !== "urgent" ? (current?.fixes ?? null) : null;
  const trackName = choice ? t(TAB_KEY[choice]) : "";
  const showList = urgentShown || (generatedFixes && generatedFixes.length > 0 && !locked);

  let body: React.ReactNode = null;
  if (!active) {
    body = <p className="text-sm text-white/60">{t("fixTracks.pickPrompt")}</p>;
  } else if (confirming === active) {
    body = (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-sm text-white/70">{t("fixTracks.confirmHint")}</p>
        <Button className="mt-3" size="sm" variant="primary" onClick={confirm}>
          {t("fixTracks.confirm")}
        </Button>
      </div>
    );
  } else if (locked) {
    body = (
      <div className="rounded-xl border border-champagne-400/15 bg-champagne-400/[0.04] p-4 text-center">
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-white">
          <Lock className="size-4" /> {t("fixTracks.lockedTitle")}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-white/60">
          {fill(t(isAnon ? "fixTracks.lockedBodyAnon" : "fixTracks.lockedBodyFree"), { track: trackName })}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {isAnon && (
            <Link href={SIGNUP_HREF}>
              <Button size="sm" variant="secondary">{t("fixTracks.ctaSignup")}</Button>
            </Link>
          )}
          <Link href={PRO_HREF}>
            <Button size="sm" variant="primary">{t("fixTracks.ctaPro")}</Button>
          </Link>
        </div>
      </div>
    );
  } else if (status.kind === "loading") {
    body = (
      <div aria-live="polite" className="space-y-2">
        <p className="flex items-center gap-2 text-xs text-white/60">
          <Loader2 className="size-3.5 animate-spin" /> {t("fixTracks.loading")}
        </p>
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-16 animate-pulse rounded-xl border border-white/[0.04] bg-white/[0.02]" />
        ))}
      </div>
    );
  } else if (status.kind === "error") {
    body = (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-white/70">
        <p>{t(status.exhausted ? "fixTracks.errorExhausted" : "fixTracks.error")}</p>
        {!status.exhausted && (
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => active && void load(active)}>
            {t("fixTracks.retry")}
          </Button>
        )}
      </div>
    );
  } else if (status.kind === "unavailable" && active !== "urgent") {
    body = <p className="text-sm text-white/60">{t("fixTracks.unavailable")}</p>;
  } else if (active === "competitor" && current?.empty === "no_competitor") {
    body = (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-white/70">
        <p>{t("fixTracks.emptyCompetitor")}</p>
        <Link
          href={isAnon ? SIGNUP_HREF : "/app/library"}
          className="mt-2 inline-block text-xs text-signal-300 hover:underline"
        >
          {t("fixTracks.emptyCompetitorLink")} →
        </Link>
      </div>
    );
  }

  const competitor = active === "competitor" ? current?.meta?.competitor : undefined;
  const note =
    active === "post_purchase" ? (
      <p className="mb-3 text-xs italic text-white/50">{t("fixTracks.postNote")}</p>
    ) : competitor && showList ? (
      <a
        href={competitor.url}
        target="_blank"
        rel="noopener nofollow"
        className="mb-3 flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-white hover:border-white/20"
      >
        {competitor.faviconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={competitor.faviconUrl} alt="" width={20} height={20} className="size-5 rounded" />
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="text-[10px] uppercase tracking-wide text-white/40">{t("fixTracks.benchmarkLabel")}</span>{" "}
          {competitor.title}
        </span>
        <ExternalLink className="size-3.5 text-white/40" />
      </a>
    ) : null;

  const listFixes: Fix[] = urgentShown ? urgentFixes : showList ? (generatedFixes as Fix[]) : [];

  return (
    <TopFixes
      fixes={listFixes}
      unlockedCount={isPaid ? undefined : 1}
      header={tabs}
      note={note}
    >
      {body && <div className={cn(listFixes.length > 0 && "mt-4")}>{body}</div>}
    </TopFixes>
  );
}
