import Link from "next/link";
import { Sparkles, Info, ArrowRight } from "lucide-react";
import {
  listNiches,
  getNicheTrendHistory,
  inferUserNicheSlug,
} from "@/lib/trends";
import { NicheSearch } from "@/components/trends/niche-search";
import { TrendsBoard } from "@/components/trends/trends-board";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refreshTrendsNow } from "@/app/actions/trends";

export const metadata = { title: "Trends" };
export const dynamic = "force-dynamic";

function fmtWeek(week: string): string {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string }>;
}) {
  const sp = await searchParams;
  const explicitSlug = sp.niche ?? null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Personalization (T3): with no niche chosen, default to the user's likely
  // niche, inferred from existing data only (self-store / latest analysis).
  // Read-only, no model call; null → today's empty-picker state.
  const inferredSlug =
    !explicitSlug && user ? await inferUserNicheSlug(user.id) : null;
  const slug = explicitSlug ?? inferredSlug;
  const isInferred = !explicitSlug && !!inferredSlug;

  const niches = await listNiches();
  const trends = slug ? await getNicheTrendHistory(slug) : null;

  // Internal-only "refresh now" control (gated to INTERNAL_EMAILS).
  const internalAllow = (process.env.INTERNAL_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isInternal = internalAllow.includes((user?.email ?? "").toLowerCase());

  return (
    <div className="min-h-screen bg-obsidian-950 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          Retention · refreshed weekly
        </p>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl tracking-tight">
          Trends
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
          What&apos;s rising and falling in your niche this week — sub-niches and
          products with momentum, so you know what to stock, test, and audit
          against.
        </p>

        {/* Honest provenance banner */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[11px] text-white/45 max-w-2xl">
          <Info className="size-3.5 shrink-0 mt-0.5 text-white/30" />
          <span>
            These are <strong className="text-white/70">AI estimates</strong>{" "}
            from market knowledge, refreshed once a week and cached — not live
            scraped data. Use them as directional signal, not precise stats.
          </span>
        </div>

        {isInternal && (
          <form action={refreshTrendsNow} className="mt-3">
            {slug && <input type="hidden" name="niche" value={slug} />}
            <button
              type="submit"
              className="rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-1.5 text-xs text-signal-300 hover:bg-signal-500/20 transition-colors"
            >
              ↻ Refresh {slug ? "this niche" : "all niches"} now (internal)
            </button>
          </form>
        )}

        <div className="mt-8">
          <NicheSearch niches={niches} selected={slug} />
        </div>

        {/* No niche picked yet */}
        {!trends && (
          <div className="mt-12 rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
            <Sparkles className="mx-auto size-6 text-champagne-400/70" />
            <p className="mt-3 text-sm text-white/55">
              Pick your niche above to see what&apos;s trending this week.
            </p>
          </div>
        )}

        {/* Niche selected but not refreshed yet */}
        {trends && !trends.week && (
          <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
            <h2 className="font-serif text-2xl tracking-tight">
              {trends.niche.name}
            </h2>
            <p className="mt-3 text-sm text-white/50 max-w-md mx-auto leading-relaxed">
              Trends for this niche haven&apos;t been refreshed yet. The weekly
              job lands fresh signals every Monday — check back soon.
            </p>
          </div>
        )}

        {/* Trends */}
        {trends && trends.week && (
          <div className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-2xl tracking-tight">
                    {trends.niche.name}
                  </h2>
                  {isInferred && (
                    <span className="inline-flex items-center rounded-full bg-signal-600/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal-300 ring-1 ring-signal-400/30">
                      Your niche
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-white/40">
                  {isInferred && "Auto-selected from your store · change above · "}
                  Week of {fmtWeek(trends.week)} · {trends.subniches.length}{" "}
                  sub-niches · {trends.products.length} products
                </p>
              </div>
              <Link
                href={`/app/analyzer?from=trend&niche=${trends.niche.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-champagne-400 px-4 py-2 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors"
              >
                Audit your store against this trend
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <TrendsBoard
              subniches={trends.subniches}
              products={trends.products}
              nicheSlug={trends.niche.slug}
            />
          </div>
        )}
      </div>
    </div>
  );
}
