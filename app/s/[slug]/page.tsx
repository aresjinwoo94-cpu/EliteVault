import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnnotationsOverlay } from "@/components/analyzer/annotations-overlay";
import type { Annotation } from "@/lib/supabase/types";

// Slug-addressed, public, logged-out friendly — never static.
export const dynamic = "force-dynamic";

interface SharedAudit {
  url: string | null;
  score: number | null;
  summary: string | null;
  screenshot_url: string | null;
  category_scores: Record<string, number> | null;
  annotations: Annotation[] | null;
  created_at: string | null;
}

async function loadSharedAudit(slug: string): Promise<SharedAudit | null> {
  const supabase = await createSupabaseServerClient();
  // SECURITY DEFINER RPC — returns only the public diagnosis fields.
  // Cast: the RPC isn't in the hand-written Database type (same known
  // types gap noted in next.config.mjs), so .rpc() args type as `never`.
  const { data, error } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase as any
  ).rpc("get_shared_audit", { p_slug: slug });
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return {
    url: d.url ?? null,
    score: typeof d.score === "number" ? d.score : Number(d.score) || null,
    summary: d.summary ?? null,
    screenshot_url: d.screenshot_url ?? null,
    category_scores: d.category_scores ?? null,
    annotations: (d.annotations as Annotation[]) ?? null,
    created_at: d.created_at ?? null,
  };
}

function domainOf(url: string | null): string {
  if (!url) return "this store";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "this store";
  }
}

function normalizedScore(raw: number | null): number {
  const s = raw ?? 0;
  return Math.round(s > 1 ? s : s * 100);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const audit = await loadSharedAudit(slug);
  if (!audit) {
    return { title: "Audit not found — EliteVault" };
  }
  const domain = domainOf(audit.url);
  const score = normalizedScore(audit.score);
  const title = `${domain} scored ${score}/100 — EliteVault audit`;
  const description =
    audit.summary?.slice(0, 160) ??
    `See the annotated conversion audit of ${domain}, then audit your own store free.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  color_integration: "Color",
  layout_proportion: "Layout",
  image_quality: "Imagery",
  technical_optimization: "Technical",
  niche_coherence: "Niche fit",
  cro_principles: "CRO",
};

export default async function SharedAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const audit = await loadSharedAudit(slug);
  if (!audit) notFound();

  const domain = domainOf(audit.url);
  const score = normalizedScore(audit.score);
  const tier =
    score >= 90
      ? "World-class"
      : score >= 75
        ? "Strong"
        : score >= 55
          ? "Average"
          : score >= 35
            ? "Below avg."
            : "Broken";

  const categories = audit.category_scores
    ? Object.entries(audit.category_scores).filter(
        ([k]) => k in CATEGORY_LABELS,
      )
    : [];

  return (
    <div className="min-h-screen bg-obsidian-950 text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-obsidian-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/">
            <Logo size={24} />
          </Link>
          <Link href={`/sign-up?next=/app/analyzer`}>
            <Button size="sm">
              Audit your store free
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12 space-y-6">
        {/* Score hero */}
        <div className="text-center">
          <Badge variant="gold" className="mx-auto">
            <Sparkles className="size-3" />
            Public audit
          </Badge>
          <h1 className="mt-4 font-serif text-3xl md:text-5xl tracking-tight break-words">
            <span className="text-white/70">{domain}</span> scored
          </h1>
          <div className="mt-3 flex items-baseline justify-center gap-2">
            <span className="font-mono tabular-nums text-7xl md:text-8xl tnum text-gold-gradient leading-none">
              {score}
            </span>
            <span className="text-2xl text-white/40">/ 100</span>
          </div>
          <Badge variant="gold" className="mt-4">
            {tier}
          </Badge>
          {audit.summary && (
            <p className="mx-auto mt-6 max-w-2xl text-sm md:text-base text-white/65 leading-relaxed">
              {audit.summary}
            </p>
          )}
        </div>

        {/* Category breakdown */}
        {categories.length > 0 && (
          <Card className="p-5 md:p-6">
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-4">
              Category scores
            </p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {categories.map(([key, val]) => {
                const pct = Math.round(val > 1 ? val : val * 100);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-white/55">
                      {CATEGORY_LABELS[key]}
                    </span>
                    <div className="relative h-1.5 flex-1 rounded-full bg-white/[0.06]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-signal-500 to-champagne-400"
                        style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-mono tabular-nums tnum text-white/70">
                      {pct}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Annotated screenshot — the shareable "wow". Mobile-friendly via
            the overlay's own responsive image. */}
        {audit.annotations && audit.annotations.length > 0 && (
          <AnnotationsOverlay
            imageUrl={audit.screenshot_url ?? ""}
            annotations={audit.annotations}
          />
        )}

        {/* Conversion CTA */}
        <Card className="relative overflow-hidden p-8 md:p-10 text-center border-champagne-400/20 bg-gradient-to-br from-champagne-400/[0.05] to-signal-600/[0.05]">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />
          <div className="relative">
            <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
              Want this for your store?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/60 leading-relaxed">
              Paste your URL and get the same brutal audit — overall score and
              annotated screenshot — free. No credit card.
            </p>
            <Link href="/sign-up?next=/app/analyzer" className="mt-6 inline-block">
              <Button size="xl">
                Audit your store free
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <p className="mt-3 text-[11px] text-white/35 inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3" />
              Estimates, not guarantees · 1 free analysis · no card
            </p>
          </div>
        </Card>

        <p className="pb-8 text-center text-[11px] text-white/30">
          Audited with{" "}
          <Link href="/" className="text-white/50 hover:text-white/80">
            EliteVault
          </Link>{" "}
          · figures are AI estimates, not predictions.
        </p>
      </main>
    </div>
  );
}
