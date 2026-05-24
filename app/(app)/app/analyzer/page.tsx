import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalyzerLauncher } from "@/components/analyzer/analyzer-launcher";
import { Badge } from "@/components/ui/badge";
import { PLANS } from "@/lib/stripe/plans";

export const metadata = { title: "Analyzer" };

export default async function AnalyzerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-white/40">
              Analyzer
            </span>
            <Badge variant="ai">
              <Sparkles className="size-3" />
              Powered by Claude
            </Badge>
          </div>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">
            What store do you want to{" "}
            <span className="italic text-gold-gradient">crack open?</span>
          </h1>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Credits
          </p>
          <p className="font-serif text-3xl tnum text-gold-gradient">
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
      />

      <section>
        <h2 className="text-sm font-medium text-white/70 mb-3">
          Your analyses
        </h2>
        {!history || history.length === 0 ? (
          <p className="text-sm text-white/40">No analyses yet.</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((h) => {
              const score = (h.result as { score?: number } | null)?.score;
              return (
                <Link
                  key={h.id}
                  href={`/app/analyzer/${h.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-white/[0.04] bg-card/30 p-4 hover:border-white/[0.12] hover:bg-card/60 transition-all"
                >
                  <div className="font-serif text-2xl text-gold-gradient tnum w-14 text-center">
                    {score ?? "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/90 truncate">
                      {h.url ?? "Uploaded screenshot"}
                    </p>
                    <p className="text-xs text-white/40">
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
