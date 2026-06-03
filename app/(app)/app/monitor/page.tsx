import { redirect } from "next/navigation";
import Link from "next/link";
import { Store, Target, Clock, Trash2, Mail, RefreshCw } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";
import { AddStoreForm } from "@/components/monitor/add-store-form";
import { removeMonitoredStore, runMyCheckNow } from "@/app/actions/monitoring";

export const metadata = { title: "Monitor" };
export const dynamic = "force-dynamic";

type StoreRow = {
  id: string;
  url: string;
  domain: string;
  label: string | null;
  kind: "self" | "competitor";
  last_score: number | null;
  last_audited_at: string | null;
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null)
    return <span className="text-sm text-white/30">not yet checked</span>;
  return (
    <span className="font-serif text-2xl text-gold-gradient tnum">
      {score}
      <span className="ml-0.5 text-xs text-white/40">/100</span>
    </span>
  );
}

function StoreCard({ store }: { store: StoreRow }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white/90">
          {store.label ?? store.domain}
        </p>
        <p className="truncate text-xs text-white/40">{store.url}</p>
        {store.last_audited_at && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-white/35">
            <Clock className="size-3" />
            checked {new Date(store.last_audited_at).toLocaleDateString("en-US")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <ScoreBadge score={store.last_score} />
        <form action={removeMonitoredStore}>
          <input type="hidden" name="id" value={store.id} />
          <button
            type="submit"
            aria-label="Remove"
            className="rounded-md p-1.5 text-white/30 hover:text-destructive hover:bg-white/[0.04] transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

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

  const { data: rows } = await supabase
    .from("monitored_stores")
    .select("id, url, domain, label, kind, last_score, last_audited_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const stores = (rows as StoreRow[] | null) ?? [];
  const self = stores.find((s) => s.kind === "self") ?? null;
  const competitors = stores.filter((s) => s.kind === "competitor");
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
              className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20 transition-colors"
            >
              <RefreshCw className="size-3.5" />
              Run my check now
            </button>
          </form>
        </div>

        {/* Your store */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40 mb-3">
            <Store className="size-3.5" />
            Your store
          </h2>
          {self ? (
            <StoreCard store={self} />
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-4">
              <p className="mb-3 text-sm text-white/55">
                Add your store to start the weekly check.
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
              {competitors.length}/{competitorLimit} used
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
              {competitors.map((c) => (
                <StoreCard key={c.id} store={c} />
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
          breakdown.
        </p>
      </div>
    </div>
  );
}
