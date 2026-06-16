import { redirect } from "next/navigation";
import Link from "next/link";
import { Store, Target, Mail, RefreshCw } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";
import {
  snapshotMonitorSource as monitorSource,
  rankBenchmark,
} from "@/lib/monitoring";
import { AddStoreForm } from "@/components/monitor/add-store-form";
import { StoreOverviewCard } from "@/components/monitor/store-overview-card";
import { Benchmark } from "@/components/monitor/benchmark";
import { runMyCheckNow } from "@/app/actions/monitoring";

export const metadata = { title: "Monitor" };
export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = ((profile as { plan?: PlanTier } | null)?.plan ?? "free") as PlanTier;
  const competitorLimit = PLANS[plan].quotas.monitoredCompetitors;

  // Read-only over monitored_stores + score_snapshots (M1/M2/M4).
  const overview = await monitorSource.getMonitorOverview(user.id);
  const benchmark = rankBenchmark(overview);
  const self = overview.self;
  const competitors = overview.competitors;
  const competitorsLeft = Math.max(0, competitorLimit - competitors.length);

  return (
    <div className="min-h-screen bg-obsidian-950 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          Retention · weekly autopilot
        </p>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl tracking-tight">
          Monitor
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
          Track your store and competitors. Every week we re-check each one and
          email you a digest of what moved — so you catch a slipping score (or a
          competitor pulling ahead) without lifting a finger.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-white/45">
            <Mail className="size-3.5 text-white/30" />
            Weekly digest to {user.email}
          </span>
          <form action={runMyCheckNow}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-1.5 text-xs text-signal-300 hover:bg-signal-500/20 transition-colors"
            >
              <RefreshCw className="size-3.5" />
              Run my check now
            </button>
          </form>
        </div>

        {/* Competitor scoreboard — self-hides until there are 2+ scored stores */}
        <Benchmark data={benchmark} />

        {/* Your store */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40 mb-3">
            <Store className="size-3.5" />
            Your store
          </h2>
          {self ? (
            <StoreOverviewCard store={self} />
          ) : (
            <div className="rounded-xl border border-champagne-400/20 bg-champagne-400/[0.03] p-5">
              <p className="text-sm font-medium text-white/85">
                Add your store to start the weekly autopilot.
              </p>
              <p className="mt-1 mb-3 text-xs text-white/50 leading-relaxed">
                We&apos;ll re-score it every week, chart the trend, and email you
                when it moves. Takes 10 seconds.
              </p>
              <AddStoreForm kind="self" />
            </div>
          )}
        </section>

        {/* Competitors */}
        <section className="mt-8">
          <h2 className="flex items-center justify-between text-[11px] uppercase tracking-widest text-white/40 mb-3">
            <span className="flex items-center gap-2">
              <Target className="size-3.5" />
              Competitors
            </span>
            <span className="text-white/30">
              <span className="num">
                {competitors.length}/{competitorLimit}
              </span>{" "}
              used
            </span>
          </h2>

          {competitorLimit === 0 ? (
            <div className="rounded-xl border border-champagne-400/20 bg-champagne-400/[0.03] p-4">
              <p className="text-sm text-white/70">
                Competitor monitoring is a Pro feature.{" "}
                <Link
                  href="/app/billing"
                  className="text-champagne-400 hover:text-champagne-300"
                >
                  Upgrade to track competitors →
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {competitors.length === 0 && competitorsLeft > 0 && (
                <p className="text-xs text-white/40">
                  Add up to {competitorLimit} competitors to see the scoreboard
                  and catch anyone pulling ahead.
                </p>
              )}
              {competitors.map((c) => (
                <StoreOverviewCard key={c.id} store={c} />
              ))}
              {competitorsLeft > 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-4">
                  <AddStoreForm
                    kind="competitor"
                    competitorsLeft={competitorsLeft}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <p className="mt-8 text-[11px] text-white/30 leading-relaxed">
          Scores are a fast conversion estimate of each store&apos;s homepage
          (not a full audit). Run the full Analyzer any time for the deep
          breakdown. Alert thresholds are flagged here and included in your
          weekly digest email; standalone real-time alerts are on the roadmap.
        </p>
      </div>
    </div>
  );
}
