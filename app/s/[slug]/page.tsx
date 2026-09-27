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
import { CategoryRadar } from "@/components/analyzer/category-radar";
import { ReportHeroV2 } from "@/components/analyzer/report-hero-v2";
import { analyzerReportV2Enabled } from "@/lib/flags";
import { buildShareResult, shareMeta, type SharedAuditRow } from "@/lib/analyzer/share-v2";
import type { Annotation } from "@/lib/supabase/types";

// Slug-addressed, public, logged-out friendly — never static.
export const dynamic = "force-dynamic";

type SharedAudit = SharedAuditRow;

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
    // report-v2 parity (undefined on old audits / pre-migration RPC):
    ad_readiness_verdict: d.ad_readiness_verdict ?? null,
    blocker_count: d.blocker_count ?? null,
    fix_count: d.fix_count ?? null,
    potential_why: Array.isArray(d.potential_why) ? d.potential_why : null,
    capture_blocked:
      typeof d.capture_blocked === "boolean" ? d.capture_blocked : null,
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

  // v2 (flag on, prod default): verdict + revenue-potential band, NO score.
  if (analyzerReportV2Enabled()) {
    const { title, description } = shareMeta(domain, buildShareResult(audit));
    const desc = (audit.summary?.slice(0, 160) ?? description).slice(0, 200);
    return {
      title,
      description: desc,
      alternates: { canonical: `/s/${slug}` },
      openGraph: { title, description: desc, type: "article" },
      twitter: { card: "summary_large_image", title, description: desc },
    };
  }

  // Flag off: the original score-based metadata.
  const score = normalizedScore(audit.score);
  const title = `${domain} conversion audit — scored ${score}/100 · EliteVault`;
  const description =
    audit.summary?.slice(0, 160) ??
    `See the annotated conversion audit of ${domain}, then audit your own store free.`;
  return {
    title,
    description,
    alternates: { canonical: `/s/${slug}` },
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

/** Shared top bar (same on both variants). */
function ShareHeader() {
  return (
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
  );
}

/** Shared bottom CTA + footer (same on both variants). */
function ShareFooter() {
  return (
    <>
      <Card className="relative overflow-hidden p-8 md:p-10 text-center border-champagne-400/20 bg-gradient-to-br from-champagne-400/[0.05] to-signal-600/[0.05]">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />
        <div className="relative">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Want this for your store?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-white/60 leading-relaxed">
            Paste your URL and get the same brutal audit — the ad-readiness
            verdict, your revenue potential and an annotated screenshot — free.
            No credit card.
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
        </Link>
        .
      </p>
    </>
  );
}

export default async function SharedAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const audit = await loadSharedAudit(slug);
  if (!audit) notFound();

  const domain = domainOf(audit.url);
  const v2 = analyzerReportV2Enabled();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

  // ── v2 (prod default): the SAME hero as the report — verdict in words, the
  //    revenue-potential band, "Why this potential", the leak radar and the
  //    annotated screenshot. No score anywhere. Old shared audits (no verdict /
  //    potential_why) degrade to the generic verdict + generic bullets via the
  //    report-v2 helpers' own fallbacks; a blocked capture hides the AI lines.
  if (v2) {
    const result = buildShareResult(audit);
    const { title } = shareMeta(domain, result);
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description:
        audit.summary?.slice(0, 200) ??
        `An annotated conversion audit of ${domain}.`,
      url: `${baseUrl}/s/${slug}`,
      about: { "@type": "Thing", name: domain },
      author: { "@type": "Organization", name: "EliteVault" },
      publisher: {
        "@type": "Organization",
        name: "EliteVault",
        logo: { "@type": "ImageObject", url: `${baseUrl}/icon.svg` },
      },
    };

    return (
      <div className="min-h-screen bg-obsidian-950 text-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ShareHeader />
        <main className="mx-auto max-w-5xl px-4 py-8 pb-24 md:px-6 md:py-12 space-y-6">
          <div className="flex justify-center">
            <Badge variant="gold">
              <Sparkles className="size-3" />
              Public audit
            </Badge>
          </div>

          {/* Same 2-col hero as the report: verdict + potential + why (LEFT),
              the leak radar (RIGHT). Stacks on mobile. No score shown. */}
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <div className="min-w-0">
              <ReportHeroV2 result={result} domain={domain} shareMode />
            </div>
            <div className="min-w-0">
              <CategoryRadar
                scores={result.category_scores}
                overall={null}
                leaksFraming
                hideReconcile
              />
            </div>
          </div>

          {/* Annotated screenshot — the shareable "wow", full width. */}
          {audit.annotations && audit.annotations.length > 0 && (
            <AnnotationsOverlay
              imageUrl={audit.screenshot_url ?? ""}
              annotations={audit.annotations as Annotation[]}
              altLabel={`Annotated conversion audit screenshot of ${domain}`}
            />
          )}

          <ShareFooter />
        </main>
      </div>
    );
  }

  // ── Flag off: the original score-based page, byte for byte. ────────────────
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
    ? Object.entries(audit.category_scores).filter(([k]) => k in CATEGORY_LABELS)
    : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${domain} conversion audit — ${score}/100`,
    description:
      audit.summary?.slice(0, 200) ??
      `An annotated conversion audit of ${domain}.`,
    url: `${baseUrl}/s/${slug}`,
    about: { "@type": "Thing", name: domain },
    author: { "@type": "Organization", name: "EliteVault" },
    publisher: {
      "@type": "Organization",
      name: "EliteVault",
      logo: { "@type": "ImageObject", url: `${baseUrl}/icon.svg` },
    },
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ShareHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 pb-24 md:px-6 md:py-12 space-y-6">
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
            <p className="text-[11px] uppercase tracking-widest text-white/40 mb-4">
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

        {/* Annotated screenshot */}
        {audit.annotations && audit.annotations.length > 0 && (
          <AnnotationsOverlay
            imageUrl={audit.screenshot_url ?? ""}
            annotations={audit.annotations as Annotation[]}
            altLabel={`Annotated conversion audit screenshot of ${domain}`}
          />
        )}

        <ShareFooter />
      </main>
    </div>
  );
}
