import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalyzerLauncher } from "@/components/analyzer/analyzer-launcher";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score-badge";
import { PLANS } from "@/lib/stripe/plans";

// NOTE: /app/* is disallowed in robots.txt (dashboard, not indexed), so this
// description/keywords are for the browser tab + completeness, not Google
// ranking. The PUBLIC, indexable analyzer landing is /free-website-audit.
export const metadata = {
  title: "Analyzer",
  description:
    "Run an AI conversion audit of your store — annotated screenshot, buyer-persona simulation and prioritized fixes ranked by impact.",
  keywords: [
    "store analyzer",
    "ai conversion audit",
    "annotated screenshot audit",
    "buyer persona simulation",
    "cro analyzer",
  ],
};

export default async function AnalyzerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; url?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: history }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, credits")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("analyses")
      .select("id, url, status, result, created_at, finished_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const sp = await searchParams;
  const plan = PLANS[profile?.plan ?? "free"];

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-6xl mx-auto space-y-8 md:space-y-10">
      {/*
        Header — wraps to a column on mobile so the credits counter
        doesn't get cramped next to a long h1. On md+ it sits to the
        right of the title.
      */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-white/40">
              Analyzer
            </span>
            <Badge variant="ai">
              <Sparkles className="size-3" />
              AI conversion audit
            </Badge>
          </div>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
            What store do you want to{" "}
            <span className="text-gold-gradient">crack open?</span>
          </h1>
        </div>
        <div className="text-left sm:text-right shrink-0">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Credits
          </p>
          <p className="mt-1 font-mono text-3xl tabular-nums text-gold-gradient leading-none">
            {profile?.credits ?? 0}
          </p>
        </div>
      </header>

      {sp.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {sp.error}
        </div>
      )}

      <AnalyzerLauncher
        canRun={(profile?.credits ?? 0) > 0 && plan.unlocksAnalyzer}
        plan={plan.id}
        initialUrl={sp.url ?? ""}
      />

      <section>
        <h2 className="text-sm font-medium text-white/70 mb-4">
          Your analyses
        </h2>
        {!history || history.length === 0 ? (
          <Card className="p-8 md:p-10 text-center border-white/[0.04]">
            <p className="text-sm text-white/40">
              No analyses yet — run your first one above.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((h) => {
              const score = (h.result as { score?: number } | null)?.score;
              return (
                <Link
                  key={h.id}
                  href={`/app/analyzer/${h.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-white/[0.04] bg-card/30 px-4 py-3.5 hover:border-white/[0.12] hover:bg-card/60 transition-all"
                >
                  <div className="w-14 flex justify-center shrink-0">
                    {typeof score === "number" ? (
                      <ScoreBadge score={score} total={null} size="md" />
                    ) : (
                      <span className="font-mono text-white/30">—</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/90 truncate">
                      {h.url ?? "Uploaded screenshot"}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {new Date(h.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant={
                      h.status === "succeeded"
                        ? "success"
                        : h.status === "failed" || h.status === "refunded"
                          ? "danger"
                          : h.status === "running" || h.status === "queued"
                            ? "ai"
                            : "default"
                    }
                  >
                    {h.status}
                  </Badge>
                  <ArrowUpRight className="size-4 text-white/30 group-hover:text-white/70 transition-colors" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
