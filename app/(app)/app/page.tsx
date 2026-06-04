import Link from "next/link";
import { ArrowRight, Library, Scan, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PLANS } from "@/lib/stripe/plans";
import { formatCompact } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: recent }, { count: totalSites }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("plan, credits, full_name, first_value_at")
        .eq("id", user!.id)
        .single(),
      supabase
        .from("analyses")
        .select("id, url, status, result, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("winning_sites")
        .select("*", { count: "exact", head: true }),
    ]);

  const plan = PLANS[(profile?.plan ?? "free") as keyof typeof PLANS];
  const first = (profile?.full_name ?? "").split(" ")[0] ?? "";

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-6xl mx-auto space-y-10 md:space-y-12">
      <header>
        <p className="text-xs uppercase tracking-widest text-white/40">
          Welcome back{first ? `, ${first}` : ""}
        </p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
          What are we{" "}
          <span className="italic text-gold-gradient">analyzing</span> today?
        </h1>
      </header>

      {/* Activation nudge (Phase 5): until a user gets their first audit, push
          them to the <60s "wow". Disappears the moment first_value_at is set. */}
      {!(profile as { first_value_at?: string | null } | null)?.first_value_at && (
        <Link href="/app/analyzer" className="group block">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-champagne-400/30 bg-gradient-to-r from-champagne-400/[0.08] to-violet-600/[0.06] p-5 md:p-6 transition-all hover:border-champagne-400/50">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-champagne-400/15 ring-1 ring-champagne-400/25">
                <Sparkles className="size-5 text-champagne-300" />
              </div>
              <div>
                <p className="font-medium text-white">
                  Run your first audit — see your score in under 60 seconds
                </p>
                <p className="mt-0.5 text-sm text-white/55">
                  Paste your store URL and get a real conversion score + your #1
                  fix. It&apos;s free.
                </p>
              </div>
            </div>
            <ArrowRight className="size-5 shrink-0 text-champagne-300 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      )}

      {/* Primary CTAs */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-5">
        <Link href="/app/analyzer" className="group">
          <Card className="relative overflow-hidden p-7 md:p-8 h-full transition-all hover:border-champagne-400/30 hover:shadow-gold">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-champagne-400/15 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-start justify-between">
              <div className="flex size-11 items-center justify-center rounded-xl bg-champagne-400/10 ring-1 ring-champagne-400/20">
                <Scan className="size-5 text-champagne-300" />
              </div>
              <Badge variant="gold">
                <Sparkles className="size-3" />
                Star feature
              </Badge>
            </div>
            <h2 className="mt-6 text-2xl font-medium tracking-tight">
              Analyze a store
            </h2>
            <p className="mt-2 text-sm text-white/55 leading-relaxed">
              Drop a URL or screenshot. Get a brutal CRO audit, annotated
              screenshot, and a buyer-persona simulation in under a minute.
            </p>
            <div className="mt-6 inline-flex items-center text-sm text-champagne-400 group-hover:text-champagne-300">
              Start analysis
              <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
        </Link>

        <Link href="/app/library" className="group">
          <Card className="relative overflow-hidden p-7 md:p-8 h-full transition-all hover:border-violet-500/30">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-violet-600/15 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-start justify-between">
              <div className="flex size-11 items-center justify-center rounded-xl bg-violet-600/10 ring-1 ring-violet-500/20">
                <Library className="size-5 text-violet-300" />
              </div>
              <span className="text-xs text-white/40">
                {formatCompact(totalSites ?? 0)} stores indexed
              </span>
            </div>
            <h2 className="mt-6 text-2xl font-medium tracking-tight">
              Browse the vault
            </h2>
            <p className="mt-2 text-sm text-white/55 leading-relaxed">
              The live portfolio of stores actually generating revenue right
              now. Search by prompt or by uploading a screenshot.
            </p>
            <div className="mt-6 inline-flex items-center text-sm text-violet-300 group-hover:text-violet-200">
              Explore library
              <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
        </Link>
      </div>

      {/* Stats row — gap-4 matches the CTA grid above for visual consistency */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Plan
          </p>
          <p className="mt-2 text-xl font-medium">{plan.name}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Credits
          </p>
          <p className="mt-2 font-serif text-3xl tnum text-gold-gradient">
            {profile?.credits ?? 0}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Analyses run
          </p>
          <p className="mt-2 text-xl font-medium tnum">
            {recent?.length ?? 0}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Avg. score
          </p>
          <p className="mt-2 text-xl font-medium tnum">
            {recent && recent.length > 0
              ? Math.round(
                  recent.reduce((acc, r) => {
                    const score = (r.result as { score?: number } | null)
                      ?.score;
                    return acc + (score ?? 0);
                  }, 0) / recent.length,
                )
              : "—"}
          </p>
        </Card>
      </div>

      {/* Recent analyses */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium tracking-tight">Recent audits</h2>
          {(recent?.length ?? 0) > 0 && (
            <Link
              href="/app/analyzer"
              className="text-xs text-white/40 hover:text-white transition-colors"
            >
              See all →
            </Link>
          )}
        </div>
        {!recent || recent.length === 0 ? (
          <Card className="p-10 md:p-14 text-center">
            <p className="text-white/55">
              No analyses yet. Your first audit is on us.
            </p>
            <Link href="/app/analyzer">
              <Button className="mt-6">
                Run your first analysis
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => {
              const score = (r.result as { score?: number } | null)?.score;
              return (
                <Link
                  key={r.id}
                  href={`/app/analyzer/${r.id}`}
                  className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-card/40 px-4 py-3.5 hover:border-white/[0.12] hover:bg-card/60 transition-all"
                >
                  <div className="font-serif text-2xl text-gold-gradient tnum w-16 text-center">
                    {score ?? "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {r.url ?? "Uploaded screenshot"}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant={
                      r.status === "succeeded"
                        ? "success"
                        : r.status === "failed" || r.status === "refunded"
                          ? "danger"
                          : "default"
                    }
                  >
                    {r.status}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
